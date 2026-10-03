import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaClient } from '@prisma/client';
import { configureApplication } from '../../src/config/configure-application';
import { ACCESS_TOKEN_ISSUER, type AccessTokenIssuer } from '../../src/modules/identity/domain/access-token-issuer';
import { EMAIL_SENDER, type EmailSender } from '../../src/modules/identity/domain/email-sender';
import { PASSWORD_HASHER, type PasswordHasher } from '../../src/modules/identity/domain/password-hasher';
import { PASSWORD_RESET_CHALLENGE_REPOSITORY, type PasswordResetChallengeRepository } from '../../src/modules/identity/domain/password-reset-challenge.repository';
import { PASSWORD_RESET_TOKEN_REPOSITORY, type PasswordResetTokenRepository } from '../../src/modules/identity/domain/password-reset-token.repository';
import { REFRESH_SESSION_REPOSITORY, type RefreshSessionRepository } from '../../src/modules/identity/domain/refresh-session.repository';
import { REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER, type RefreshTokenGenerator, type RefreshTokenHasher } from '../../src/modules/identity/domain/refresh-token';
import { USER_PROFILE_CHANGE_REPOSITORY, type UserProfileChangeRepository } from '../../src/modules/identity/domain/user-profile-change.repository';
import { USER_REPOSITORY, type UserRepository } from '../../src/modules/identity/domain/user.repository';
import { CryptoEmailVerificationTokenService } from '../../src/modules/identity/infrastructure/crypto-email-verification-token.service';
import { CryptoPasswordResetOtpService } from '../../src/modules/identity/infrastructure/crypto-password-reset-otp.service';
import { CryptoPasswordResetTokenService } from '../../src/modules/identity/infrastructure/crypto-password-reset-token.service';
import { assertTestDatabase } from '../integration/support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
const hookTimeout = 30_000;
const password = 'legacy-email-regression-synthetic-password';
const emailUnavailable = {
  code: 'EMAIL_CHANGE_UNAVAILABLE',
  message: 'El cambio de correo no está disponible. El correo actual se conserva.',
};

interface LoginTokens { accessToken: string; refreshToken: string }

describeWithPostgres('PATCH legacy de correo: JWT real y almacenes de tokens intactos', () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  let app: INestApplication;
  let passwordHash: string;
  let actorId: string;
  let otherUserId: string;
  let actorEmail: string;
  let otherUserEmail: string;
  let loginTokens: LoginTokens;
  let fixtureIds: string[] = [];
  let effectSpies: Record<string, jest.SpyInstance> = {};

  const stopObservingEffects = (): void => {
    for (const spy of Object.values(effectSpies)) spy.mockRestore();
    effectSpies = {};
  };

  const cleanOwnData = async (): Promise<void> => {
    if (!fixtureIds.length) return;
    assertTestDatabase(databaseUrl);
    const where = { userId: { in: fixtureIds } };
    await prisma.userProfileAudit.deleteMany({ where });
    await prisma.userDisplayNameAudit.deleteMany({ where });
    await prisma.refreshSession.deleteMany({ where });
    await prisma.passwordResetToken.deleteMany({ where });
    await prisma.passwordResetChallenge.deleteMany({ where });
    await prisma.emailVerificationToken.deleteMany({ where });
    await prisma.userBusinessMembership.deleteMany({ where });
    await prisma.localCredential.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
    fixtureIds = [];
  };

  const seedTokenHistory = async (userId: string): Promise<void> => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 86_400_000);
    const digest = (label: string): string => app.get<RefreshTokenHasher>(REFRESH_TOKEN_HASHER).hash(`${userId}:${label}:${randomUUID()}`);
    await prisma.refreshSession.create({ data: { userId, tokenHash: digest('revoked-session'), expiresAt: future, revokedAt: past } });
    for (const usedAt of [null, past]) {
      await prisma.passwordResetToken.create({ data: { userId, tokenHash: digest('reset-grant'), expiresAt: future, usedAt } });
      await prisma.passwordResetChallenge.create({ data: { userId, codeDigest: digest('reset-challenge'), expiresAt: future, lastSentAt: past, attempts: usedAt ? 2 : 0, usedAt } });
      await prisma.emailVerificationToken.create({ data: { userId, tokenHash: digest('email-verification'), expiresAt: future, usedAt } });
    }
  };

  const createFixtureUser = async (email: string): Promise<string> => {
    const user = await prisma.user.create({ data: { email, displayName: 'Titular sintético', emailVerifiedAt: new Date(), status: 'ACTIVE' } });
    fixtureIds.push(user.id);
    await prisma.localCredential.create({ data: { userId: user.id, passwordHash } });
    await seedTokenHistory(user.id);
    return user.id;
  };

  const login = async (email: string): Promise<LoginTokens> => {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
    const tokens = response.body as LoginTokens;
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(tokens.refreshToken.length).toBeGreaterThan(0);
    return tokens;
  };

  const captureSnapshot = async () => {
    const where = { userId: { in: fixtureIds } };
    const [users, credentials, sessions, resetTokens, resetChallenges, verificationTokens, profileAudits, displayNameAudits, memberships] = await prisma.$transaction([
      prisma.user.findMany({ where: { id: { in: fixtureIds } }, orderBy: { id: 'asc' } }),
      prisma.localCredential.findMany({ where, orderBy: { userId: 'asc' } }),
      prisma.refreshSession.findMany({ where, orderBy: { id: 'asc' } }),
      prisma.passwordResetToken.findMany({ where, orderBy: { id: 'asc' } }),
      prisma.passwordResetChallenge.findMany({ where, orderBy: { id: 'asc' } }),
      prisma.emailVerificationToken.findMany({ where, orderBy: { id: 'asc' } }),
      prisma.userProfileAudit.findMany({ where, orderBy: { id: 'asc' } }),
      prisma.userDisplayNameAudit.findMany({ where, orderBy: { id: 'asc' } }),
      prisma.userBusinessMembership.findMany({ where, orderBy: { id: 'asc' } }),
    ]);
    return { users, credentials, sessions, resetTokens, resetChallenges, verificationTokens, profileAudits, displayNameAudits, memberships };
  };

  const startObservingEffects = (): void => {
    const sessions = app.get<RefreshSessionRepository>(REFRESH_SESSION_REPOSITORY);
    const resetTokens = app.get<PasswordResetTokenRepository>(PASSWORD_RESET_TOKEN_REPOSITORY);
    const challenges = app.get<PasswordResetChallengeRepository>(PASSWORD_RESET_CHALLENGE_REPOSITORY);
    const otp = app.get(CryptoPasswordResetOtpService);
    const emailSender = app.get<Required<EmailSender>>(EMAIL_SENDER);
    // Los aliases useExisting comparten instancia; se espía cada método una sola vez.
    effectSpies = {
      accessIssue: jest.spyOn(app.get<AccessTokenIssuer>(ACCESS_TOKEN_ISSUER), 'issue'),
      refreshGenerate: jest.spyOn(app.get<RefreshTokenGenerator>(REFRESH_TOKEN_GENERATOR), 'generate'),
      refreshCreate: jest.spyOn(sessions, 'create'),
      refreshRotate: jest.spyOn(sessions, 'rotate'),
      refreshRevoke: jest.spyOn(sessions, 'revokeByTokenHash'),
      verificationGenerate: jest.spyOn(app.get(CryptoEmailVerificationTokenService), 'generate'),
      resetTokenGenerate: jest.spyOn(app.get(CryptoPasswordResetTokenService), 'generate'),
      resetCodeGenerate: jest.spyOn(otp, 'generateCode'),
      resetGrantGenerate: jest.spyOn(otp, 'generateGrant'),
      resetInvalidate: jest.spyOn(resetTokens, 'invalidatePending'),
      resetCreate: jest.spyOn(resetTokens, 'create'),
      resetConsume: jest.spyOn(resetTokens, 'consumeAndResetPassword'),
      challengeCreate: jest.spyOn(challenges, 'createChallenge'),
      challengeConsume: jest.spyOn(challenges, 'verifyAndCreateGrant'),
      resetEmailSend: jest.spyOn(emailSender, 'sendPasswordReset'),
      verificationEmailSend: jest.spyOn(emailSender, 'sendEmailVerification'),
      emailUpdate: jest.spyOn(app.get<UserRepository>(USER_REPOSITORY), 'updateEmail'),
      profileUpdate: jest.spyOn(app.get<UserProfileChangeRepository>(USER_PROFILE_CHANGE_REPOSITORY), 'changeDisplayName'),
    };
  };

  const patchAndAssertUnchanged = async (id: string, email: string, status: number) => {
    const before = await captureSnapshot();
    expect(before.sessions).toHaveLength(4);
    for (const tokens of [before.resetTokens, before.resetChallenges, before.verificationTokens]) expect(tokens).toHaveLength(4);
    startObservingEffects();
    const response = await request(app.getHttpServer()).patch(`/api/users/${id}`)
      .set('Authorization', `Bearer ${loginTokens.accessToken}`).send({ email }).expect(status);
    await expect(captureSnapshot()).resolves.toEqual(before);
    for (const spy of Object.values(effectSpies)) expect(spy).not.toHaveBeenCalled();
    for (const property of ['accessToken', 'refreshToken', 'token', 'tokenHash', 'password', 'passwordHash', 'resetGrant', 'challengeId', 'verificationUrl', 'memberships']) {
      expect(response.body as object).not.toHaveProperty(property);
    }
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.text).not.toContain(loginTokens.accessToken);
    expect(response.text).not.toContain(loginTokens.refreshToken);
    return response;
  };

  const assertOriginalRefreshStillWorks = async (): Promise<void> => {
    // Control positivo posterior: esta rotación no forma parte de la medición del PATCH.
    const hasher = app.get<RefreshTokenHasher>(REFRESH_TOKEN_HASHER);
    const originalHash = hasher.hash(loginTokens.refreshToken);
    const response = await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: loginTokens.refreshToken }).expect(200);
    // El PATCH ya afirmó cero llamadas; estas llamadas posteriores prueban que los spies funcionan.
    expect(effectSpies.accessIssue).toHaveBeenCalledTimes(1);
    expect(effectSpies.refreshGenerate).toHaveBeenCalledTimes(1);
    expect(effectSpies.refreshRotate).toHaveBeenCalledTimes(1);
    const rotated = response.body as LoginTokens;
    expect(rotated.refreshToken).not.toBe(loginTokens.refreshToken);
    const previous = await prisma.refreshSession.findUniqueOrThrow({ where: { tokenHash: originalHash } });
    const next = await prisma.refreshSession.findUniqueOrThrow({ where: { tokenHash: hasher.hash(rotated.refreshToken) } });
    expect(previous.revokedAt).toBeInstanceOf(Date);
    expect(previous.replacedBySessionId).toBe(next.id);
    expect(next.userId).toBe(actorId);
    expect(next.revokedAt).toBeNull();
    await request(app.getHttpServer()).get(`/api/users/${actorId}/profile`).set('Authorization', `Bearer ${loginTokens.accessToken}`).expect(200);
    stopObservingEffects();
  };

  beforeAll(async () => {
    assertTestDatabase(databaseUrl);
    if (process.env.TEST_DATABASE_URL !== databaseUrl) throw new Error('TEST_DATABASE_URL debe coincidir con la DATABASE_URL sintética.');
    if (process.env.NODE_ENV !== 'test') throw new Error('Esta regresión HTTP/PostgreSQL requiere NODE_ENV=test.');
    await prisma.$connect();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    expect(app.get(ConfigService).get('EMAIL_DELIVERY_MODE')).toBe('console');
    configureApplication(app);
    await app.init();
    passwordHash = await app.get<PasswordHasher>(PASSWORD_HASHER).hash(password);
  }, hookTimeout);

  beforeEach(async () => {
    const key = randomUUID();
    actorEmail = `legacy.nombre+${key}@example.test`;
    otherUserEmail = `legacy.other+${key}@example.test`;
    actorId = await createFixtureUser(actorEmail);
    otherUserId = await createFixtureUser(otherUserEmail);
    loginTokens = await login(actorEmail);
    await login(otherUserEmail);
  }, hookTimeout);

  afterEach(async () => {
    stopObservingEffects();
    await cleanOwnData();
  }, hookTimeout);

  afterAll(async () => {
    try { await cleanOwnData(); }
    finally { await app?.close(); await prisma.$disconnect(); }
  }, hookTimeout);

  it('SELF ACTIVE admite el correo vigente normalizado sin emitir, revocar ni modificar almacenes', async () => {
    const response = await patchAndAssertUnchanged(actorId, ` ${actorEmail.toUpperCase()} `, 200);
    expect(response.body as object).toMatchObject({ id: actorId, email: actorEmail, status: 'ACTIVE' });
    await assertOriginalRefreshStillWorks();
  }, hookTimeout);

  it.each(['disponible', 'otro titular'] as const)('rechaza el correo efectivo %s con 409 uniforme y tokens intactos', async (target) => {
    const email = target === 'disponible' ? `legacy.available+${randomUUID()}@example.test` : otherUserEmail;
    const response = await patchAndAssertUnchanged(actorId, email, 409);
    expect(response.body as object).toEqual(emailUnavailable);
    await assertOriginalRefreshStillWorks();
  }, hookTimeout);

  it('rechaza SELF ajeno con 403 y conserva los datos y tokens de ambos titulares', async () => {
    await patchAndAssertUnchanged(otherUserId, otherUserEmail, 403);
    await assertOriginalRefreshStillWorks();
  }, hookTimeout);

  it('rechaza con 401 al actor deshabilitado antes del PATCH sin revocar ni emitir tokens', async () => {
    // La preparación queda fuera del snapshot y de los spies; el guard real rechaza DISABLED.
    await prisma.user.update({ where: { id: actorId }, data: { status: 'DISABLED' } });
    await patchAndAssertUnchanged(actorId, actorEmail, 401);
  }, hookTimeout);
});
