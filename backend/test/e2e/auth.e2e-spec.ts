import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { ACCESS_TOKEN_ISSUER } from '../../src/modules/identity/domain/access-token-issuer';
import { AUTHENTICATION_REPOSITORY } from '../../src/modules/identity/domain/authentication.repository';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { PASSWORD_HASHER } from '../../src/modules/identity/domain/password-hasher';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { RefreshSession } from '../../src/modules/identity/domain/refresh-session.entity';
import { REFRESH_SESSION_REPOSITORY } from '../../src/modules/identity/domain/refresh-session.repository';
import { REFRESH_TOKEN_EXPIRATION, REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER } from '../../src/modules/identity/domain/refresh-token';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { USER_STATUS_REPOSITORY } from '../../src/modules/identity/domain/user-status.repository';

const userId = '11111111-1111-4111-8111-111111111111';
const activeUser = (): User => User.create({ id: userId, email: 'user@example.com', status: UserStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
const disabledUser = (): User => User.create({ id: userId, email: 'user@example.com', status: UserStatus.DISABLED, createdAt: new Date(), updatedAt: new Date() });
const membership = (businessId: string, role: MembershipRole): UserBusinessMembership => UserBusinessMembership.create({ id: businessId, userId, businessId, role, createdAt: new Date('2026-01-01'), updatedAt: new Date() });

describe('Auth endpoint', () => {
  let app: INestApplication;
  let record: { user: User; passwordHash: string } | null;
  let memberships: UserBusinessMembership[];
  let passwordIsValid: boolean;
  let sessions: Map<string, RefreshSession>;
  let refreshTokenSequence: number;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTHENTICATION_REPOSITORY).useValue({ findForLoginByEmail: () => Promise.resolve(record) })
      .overrideProvider(PASSWORD_HASHER).useValue({ hash: () => Promise.resolve('hash'), verify: () => Promise.resolve(passwordIsValid) })
      .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({ findByUserAndBusiness: () => Promise.resolve(null), findByUserId: () => Promise.resolve(memberships), create: () => Promise.reject(new Error('not used')) })
      .overrideProvider(ACCESS_TOKEN_ISSUER).useValue({ issue: () => Promise.resolve({ token: 'access-token', expiresIn: 900 }) })
      .overrideProvider(REFRESH_SESSION_REPOSITORY).useValue({
        create: (data: { userId: string; tokenHash: string; expiresAt: Date }) => {
          const item = RefreshSession.create({ id: `session-${sessions.size + 1}`, ...data, revokedAt: null, replacedBySessionId: null, createdAt: new Date(), updatedAt: new Date() });
          sessions.set(item.tokenHash, item);
          return Promise.resolve(item);
        },
        findByTokenHash: (tokenHash: string) => Promise.resolve(sessions.get(tokenHash) ?? null),
        revokeByTokenHash: (tokenHash: string) => {
          const session = sessions.get(tokenHash);
          if (session && !session.revokedAt) sessions.set(tokenHash, RefreshSession.create({ id: session.id, userId: session.userId, tokenHash: session.tokenHash, expiresAt: session.expiresAt, revokedAt: new Date(), replacedBySessionId: session.replacedBySessionId, createdAt: session.createdAt, updatedAt: new Date() }));
          return Promise.resolve();
        },
        rotate: (previousId: string, data: { userId: string; tokenHash: string; expiresAt: Date }) => {
          const previous = [...sessions.values()].find((item) => item.id === previousId);
          if (!previous) return Promise.reject(new Error('not found'));
          const next = RefreshSession.create({ id: `session-${sessions.size + 1}`, ...data, revokedAt: null, replacedBySessionId: null, createdAt: new Date(), updatedAt: new Date() });
          sessions.set(previous.tokenHash, RefreshSession.create({ id: previous.id, userId: previous.userId, tokenHash: previous.tokenHash, expiresAt: previous.expiresAt, revokedAt: new Date(), replacedBySessionId: next.id, createdAt: previous.createdAt, updatedAt: new Date() }));
          sessions.set(next.tokenHash, next);
          return Promise.resolve();
        },
      })
      .overrideProvider(REFRESH_TOKEN_GENERATOR).useValue({ generate: () => `refresh-token-${++refreshTokenSequence}` })
      .overrideProvider(REFRESH_TOKEN_HASHER).useValue({ hash: (token: string) => `hash:${token}` })
      .overrideProvider(REFRESH_TOKEN_EXPIRATION).useValue({ expiresAt: () => new Date('2027-02-01') })
      .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: () => Promise.resolve(record?.user ?? null) })
      .overrideProvider(USER_STATUS_REPOSITORY).useValue({ update: (user: User) => { record = record ? { ...record, user } : null; return Promise.resolve(user); } })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    record = { user: activeUser(), passwordHash: 'hash' };
    memberships = [];
    passwordIsValid = true;
    sessions = new Map();
    refreshTokenSequence = 0;
  });

  it('inicia sesión y no expone datos sensibles ni contexto activo', async () => {
    memberships = [membership('business-a', MembershipRole.OWNER), membership('business-b', MembershipRole.VIEWER)];
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: ' USER@EXAMPLE.COM ', password: 'contraseña' }).expect(200).expect(({ body }) => {
      expect(body).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token-1', tokenType: 'Bearer', expiresIn: 900, user: { id: userId, email: 'user@example.com', status: 'ACTIVE' }, memberships: [{ businessId: 'business-a', role: 'OWNER' }, { businessId: 'business-b', role: 'VIEWER' }] });
      ['password', 'passwordHash', 'tokenHash', 'permissions', 'businessId', 'activeBusiness'].forEach((property) => expect(body).not.toHaveProperty(property));
    });
  });

  it('permite un usuario sin membresías', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'contraseña' }).expect(200).expect(({ body }) => expect(body.memberships).toEqual([]));
  });

  it.each([{ email: 'invalid', password: 'contraseña' }, { email: 'user@example.com', password: '' }])('rechaza input inválido', async (body) => {
    await request(app.getHttpServer()).post('/api/auth/login').send(body).expect(400);
  });

  it('usa el mismo contrato para email inexistente y contraseña incorrecta', async () => {
    record = null;
    const missing = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'missing@example.com', password: 'contraseña' }).expect(401);
    record = { user: activeUser(), passwordHash: 'hash' };
    passwordIsValid = false;
    const wrongPassword = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'incorrecta' }).expect(401);
    expect(missing.body.message).toBe('Las credenciales son inválidas.');
    expect(wrongPassword.body.message).toBe(missing.body.message);
  });

  it('rechaza un usuario deshabilitado', async () => {
    record = { user: disabledUser(), passwordHash: 'hash' };
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'contraseña' }).expect(403);
  });

  it('rechaza login y refresh después de deshabilitar al usuario', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'contraseña' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/users/${userId}/disable`).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'contraseña' }).expect(403);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(403);
  });

  it('rota el refresh token y rechaza la reutilización del anterior', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'contraseÃ±a' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200).expect(({ body }) => {
      expect(body).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token-2', tokenType: 'Bearer', expiresIn: 900 });
      expect(body).not.toHaveProperty('tokenHash');
    });
    await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401).expect(({ body }) => expect(body.message).toBe('La sesi\u00f3n no es v\u00e1lida.'));
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: 'unknown-token' }])('rechaza refresh token inválido', async (body) => {
    await request(app.getHttpServer()).post('/api/auth/refresh').send(body).expect(body.refreshToken === undefined || body.refreshToken === '' ? 400 : 401);
  });

  it('cierra sesión de forma idempotente sin cuerpo', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'user@example.com', password: 'contraseña' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(204).expect(({ body }) => expect(body).toEqual({}));
    await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: login.body.refreshToken }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/logout').send({ refreshToken: 'unknown-token' }).expect(204);
  });
});
