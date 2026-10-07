import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../../src/config/configure-application';
import { validateEnvironment } from '../../src/config/environment';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { ACCESS_TOKEN_ISSUER } from '../../src/modules/identity/domain/access-token-issuer';
import { AUTHENTICATION_REPOSITORY } from '../../src/modules/identity/domain/authentication.repository';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { PASSWORD_HASHER } from '../../src/modules/identity/domain/password-hasher';
import { REFRESH_SESSION_REPOSITORY } from '../../src/modules/identity/domain/refresh-session.repository';
import { REFRESH_TOKEN_EXPIRATION, REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER } from '../../src/modules/identity/domain/refresh-token';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { RefreshSession } from '../../src/modules/identity/domain/refresh-session.entity';
import { User } from '../../src/modules/identity/domain/user.entity';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { DisabledEmailSender } from '../../src/modules/identity/infrastructure/disabled-email-sender';
import { EMAIL_SENDER } from '../../src/modules/identity/domain/email-sender';

const origin = 'http://192.168.1.20:3001';
const userId = '11111111-1111-4111-8111-111111111111';
const configuration = validateEnvironment({
  NODE_ENV: 'production', TOP_DEPLOYMENT_PROFILE: 'lan-pilot',
  DATABASE_URL: `postgresql://top_pilot_app:${'A'.repeat(32)}@postgres:5432/top_pilot`,
  JWT_ACCESS_SECRET: 'J'.repeat(32), PASSWORD_RESET_OTP_SECRET: 'O'.repeat(32),
  APP_PUBLIC_URL: origin, CORS_ORIGIN: origin, EMAIL_DELIVERY_MODE: 'disabled',
  S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: origin, S3_REGION: 'us-east-1',
  S3_BUCKET: 'top-pilot-assets', S3_ACCESS_KEY: 'synthetic-access', S3_SECRET_KEY: 'synthetic-storage-secret', S3_FORCE_PATH_STYLE: 'true',
});

describe('Contrato HTTP de autenticación LAN piloto sin persistencia externa', () => {
  let app: INestApplication;
  let active: User;
  let sessions: Map<string, RefreshSession>;
  let sequence: number;
  const findForLoginByEmail = jest.fn(() => Promise.resolve({ user: active, passwordHash: 'synthetic-hash' }));
  const hashPassword = jest.fn();
  const query = jest.fn();
  const transaction = jest.fn();
  const issue = jest.fn(() => Promise.resolve({ token: 'synthetic-access-token', expiresIn: 900 }));
  const generate = jest.fn(() => `synthetic-refresh-${++sequence}`);

  beforeAll(async () => {
    const config = new ConfigService(configuration);
    jest.spyOn(config, 'get').mockImplementation((key: string) => configuration[key]);
    const module = await Test.createTestingModule({ imports: [IdentityModule] })
      .overrideProvider(ConfigService).useValue(config)
      .overrideProvider(PrismaIdentityService).useValue({ user: { findUnique: query }, emailVerificationToken: { findUnique: query, findFirst: query }, $transaction: transaction })
      .overrideProvider(AUTHENTICATION_REPOSITORY).useValue({ findForLoginByEmail })
      .overrideProvider(PASSWORD_HASHER).useValue({ hash: hashPassword, verify: () => Promise.resolve(true) })
      .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({ findByUserId: () => Promise.resolve([]) })
      .overrideProvider(ACCESS_TOKEN_ISSUER).useValue({ issue })
      .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: () => Promise.resolve(active) })
      .overrideProvider(REFRESH_TOKEN_GENERATOR).useValue({ generate })
      .overrideProvider(REFRESH_TOKEN_HASHER).useValue({ hash: (token: string) => `hash:${token}` })
      .overrideProvider(REFRESH_TOKEN_EXPIRATION).useValue({ expiresAt: () => new Date(Date.now() + 86400000) })
      .overrideProvider(REFRESH_SESSION_REPOSITORY).useValue({
        create: (data: { userId: string; tokenHash: string; expiresAt: Date }) => {
          const session = RefreshSession.create({ id: `session-${sessions.size + 1}`, ...data, revokedAt: null, replacedBySessionId: null, createdAt: new Date(), updatedAt: new Date() });
          sessions.set(session.tokenHash, session);
          return Promise.resolve(session);
        },
        findByTokenHash: (hash: string) => Promise.resolve(sessions.get(hash) ?? null),
        revokeByTokenHash: (hash: string) => { sessions.delete(hash); return Promise.resolve(); },
        rotate: (id: string, data: { userId: string; tokenHash: string; expiresAt: Date }) => {
          const previous = [...sessions.values()].find((item) => item.id === id)!;
          sessions.delete(previous.tokenHash);
          const next = RefreshSession.create({ id: `session-${++sequence}`, ...data, revokedAt: null, replacedBySessionId: null, createdAt: new Date(), updatedAt: new Date() });
          sessions.set(next.tokenHash, next);
          return Promise.resolve();
        },
      })
      .compile();
    expect(module.get(EMAIL_SENDER)).toBeInstanceOf(DisabledEmailSender);
    app = module.createNestApplication();
    configureApplication(app, { security: false, configuration });
    await app.init();
  });

  beforeEach(() => {
    active = User.create({ id: userId, email: 'family@top.test', emailVerifiedAt: new Date('2026-01-01'), status: UserStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
    sessions = new Map();
    sequence = 0;
    jest.clearAllMocks();
  });
  afterAll(async () => app?.close());

  it.each([
    ['signup', { displayName: 'Familia sintética', email: 'family@top.test', password: 'synthetic-password', businessName: 'Alojamiento sintético', timezone: 'America/Asuncion' }],
    ['resend-verification', { email: 'family@top.test' }],
    ['resend-verification', { email: 'unknown@top.test' }],
    ['forgot-password', { email: 'family@top.test' }],
    ['forgot-password', { email: 'unknown@top.test' }],
    ['verify-email', { token: 'synthetic-token-marker' }],
    ['verify-reset-code', { challengeId: 'synthetic-challenge-marker', code: '123456' }],
    ['reset-password', { resetGrant: 'synthetic-grant-marker', password: 'synthetic-password' }],
  ])('POST /auth/%s retorna el mismo 503 sin consultar ni mutar', async (route, body) => {
    const response = await request(app.getHttpServer()).post(`/api/auth/${route}`).send(body).expect(503);
    expect(response.body).toEqual({ code: 'EMAIL_FEATURE_DISABLED', message: 'Las funciones de correo están deshabilitadas durante este piloto. Usá una cuenta existente y verificada.' });
    expect(response.text).not.toContain('synthetic-token-marker');
    expect(response.text).not.toContain('123456');
    for (const effect of [findForLoginByEmail, query, transaction, hashPassword, issue, generate]) expect(effect).not.toHaveBeenCalled();
    expect(sessions.size).toBe(0);
  });

  it('permite login, refresh rotatorio y logout para la cuenta verificada', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: active.email, password: 'synthetic-password' }).expect(200);
    const refresh = await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
    expect(refresh.body.refreshToken).not.toBe(login.body.refreshToken);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: refresh.body.refreshToken }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: refresh.body.refreshToken }).expect(401);
  });

  it.each([['sin verificar', UserStatus.ACTIVE, null], ['deshabilitada', UserStatus.DISABLED, new Date('2026-01-01')]] as const)('no permite cuenta %s ni crea sesión', async (_name, status, emailVerifiedAt) => {
    active = User.create({ id: userId, email: active.email, status, emailVerifiedAt, createdAt: new Date(), updatedAt: new Date() });
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: active.email, password: 'synthetic-password' }).expect(403);
    expect(issue).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(sessions.size).toBe(0);
  });

  it('conserva CORS exacto y no registra Swagger en el piloto production', async () => {
    const allowed = await request(app.getHttpServer()).options('/api/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    const foreign = await request(app.getHttpServer()).post('/api/auth/login').set('Origin', 'http://192.168.1.21:3001').send({ email: active.email, password: 'synthetic-password' }).expect(200);
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    for (const path of ['/api/docs', '/api/docs-json', '/api/docs-yaml']) await request(app.getHttpServer()).get(path).expect(404);
  });
});
