import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { User } from '../../src/modules/identity/domain/user.entity';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { USER_REPOSITORY } from '../../src/modules/identity/domain/user.repository';
import { USER_STATUS_REPOSITORY } from '../../src/modules/identity/domain/user-status.repository';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import type { AuthenticatedRequest } from '../../src/shared/security/authenticated-principal';
import type { NextFunction, Response } from 'express';

const emailChangeUnavailable = {
  code: 'EMAIL_CHANGE_UNAVAILABLE',
  message: 'El cambio de correo no está disponible. El correo actual se conserva.',
};

describe('User endpoint', () => {
  let app: INestApplication;
  const users = new Map<string, User>();
  const usersById = new Map<string, User>();
  const repository = {
    findByEmail: jest.fn<Promise<User | null>, [string]>((email) => Promise.resolve(users.get(email) ?? null)),
    create: ({ email }: { email: string; passwordHash: string }): Promise<User> => {
      const now = new Date();
      const user = User.create({ id: randomUUID(), email, status: UserStatus.ACTIVE, createdAt: now, updatedAt: now });
      users.set(email, user);
      usersById.set(user.id, user);
      return Promise.resolve(user);
    },
    updateEmail: jest.fn<Promise<User>, [User]>((user) => {
      const previous = usersById.get(user.id);
      if (previous) users.delete(previous.email);
      users.set(user.email, user);
      usersById.set(user.id, user);
      return Promise.resolve(user);
    }),
  };
  const byIdLookup = { findById: (id: string): Promise<User | null> => Promise.resolve(usersById.get(id) ?? null) };
  const statusRepository = {
    update: (user: User): Promise<User> => {
      users.set(user.email, user);
      usersById.set(user.id, user);
      return Promise.resolve(user);
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY).useValue(repository)
      .overrideProvider(USER_BY_ID_LOOKUP).useValue(byIdLookup)
      .overrideProvider(USER_STATUS_REPOSITORY).useValue(statusRepository)
      .compile();
    app = module.createNestApplication();
    app.use((incoming: AuthenticatedRequest, _response: Response, next: NextFunction) => {
      const actorUserId = incoming.headers['x-test-user-id'];
      if (typeof actorUserId === 'string') incoming.authenticatedPrincipal = { userId: actorUserId };
      next();
    });
    configureApplication(app, { security: false });
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => { users.clear(); usersById.clear(); repository.findByEmail.mockClear(); repository.updateEmail.mockClear(); });

  it('crea, normaliza y no expone secretos', async () => {
    await request(app.getHttpServer()).post('/api/users').send({ email: ' USER+demo@Example.COM ', password: 'contraseña válida' }).expect(201).expect(({ body }) => {
      expect(body.email).toBe('user+demo@example.com');
      expect(body.status).toBe('ACTIVE');
      expect(body).not.toHaveProperty('password');
      expect(body).not.toHaveProperty('passwordHash');
    });
  });

  it.each([{ email: '', password: 'contraseña válida' }, { email: 'invalido', password: 'contraseña válida' }, { email: 'a@b.com', password: 'x'.repeat(11) }, { email: 'a@b.com', password: 'x'.repeat(129) }])('rechaza datos inválidos', async (body) => {
    await request(app.getHttpServer()).post('/api/users').send(body).expect(400);
  });

  it('rechaza duplicados normalizados', async () => {
    await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.com', password: 'contraseña válida' }).expect(201);
    await request(app.getHttpServer()).post('/api/users').send({ email: ' USER@EXAMPLE.COM ', password: 'contraseña válida' }).expect(409);
  });

  it('bloquea cambios efectivos de correo y conserva el usuario sin escribir ni exponer datos sensibles', async () => {
    const created = await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.test', password: 'contraseña válida' }).expect(201);
    const initialUser = usersById.get(created.body.id);
    repository.findByEmail.mockClear();
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}`).set('x-test-user-id', created.body.id)
      .send({ email: ' NUEVO+Demo@Ejemplo.TEST ', status: 'DISABLED', role: 'OWNER', passwordHash: 'forbidden', businessId: randomUUID() })
      .expect(409, emailChangeUnavailable);
    expect(usersById.get(created.body.id)).toBe(initialUser);
    expect(usersById.get(created.body.id)?.email).toBe('user@example.test');
    expect(usersById.get(created.body.id)?.status).toBe(UserStatus.ACTIVE);
    expect(usersById.get(created.body.id)?.updatedAt.toISOString()).toBe(created.body.updatedAt);
    expect(users.has('nuevo+demo@ejemplo.test')).toBe(false);
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.updateEmail).not.toHaveBeenCalled();
  });

  it('acepta el correo actual normalizado como no-op sin escribir ni avanzar la versión', async () => {
    const created = await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.test', password: 'contraseña válida' }).expect(201);
    const initialUser = usersById.get(created.body.id);
    repository.findByEmail.mockClear();
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}`).set('x-test-user-id', created.body.id)
      .send({ email: ' USER@EXAMPLE.TEST ', status: 'DISABLED', role: 'OWNER', passwordHash: 'forbidden' }).expect(200, created.body);
    expect(usersById.get(created.body.id)).toBe(initialUser);
    expect(usersById.get(created.body.id)?.updatedAt.toISOString()).toBe(created.body.updatedAt);
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.updateEmail).not.toHaveBeenCalled();
  });

  it('devuelve el mismo bloqueo para un correo disponible o duplicado sin consultar datos ajenos', async () => {
    const first = await request(app.getHttpServer()).post('/api/users').send({ email: 'first@example.test', password: 'contraseña válida' }).expect(201);
    const second = await request(app.getHttpServer()).post('/api/users').send({ email: 'second@example.test', password: 'contraseña válida' }).expect(201);
    const initialFirst = usersById.get(first.body.id);
    const initialSecond = usersById.get(second.body.id);
    repository.findByEmail.mockClear();
    for (const email of [' SECOND@EXAMPLE.TEST ', 'available@example.test']) {
      await request(app.getHttpServer()).patch(`/api/users/${first.body.id}`).set('x-test-user-id', first.body.id)
        .send({ email }).expect(409, emailChangeUnavailable);
    }
    expect(usersById.get(first.body.id)).toBe(initialFirst);
    expect(usersById.get(second.body.id)).toBe(initialSecond);
    expect(usersById.get(first.body.id)?.email).toBe('first@example.test');
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(repository.updateEmail).not.toHaveBeenCalled();
  });

  it('mantiene SELF y valida actor, existencia, estado e input antes del bloqueo de correo', async () => {
    const created = await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.test', password: 'contraseña válida' }).expect(201);
    const endpoint = `/api/users/${created.body.id}`;
    await request(app.getHttpServer()).patch(endpoint).set('x-test-user-id', randomUUID()).send({ email: 'user@example.test' }).expect(403);
    const missingId = randomUUID();
    await request(app.getHttpServer()).patch(`/api/users/${missingId}`).set('x-test-user-id', missingId).send({ email: 'other@example.test' }).expect(404);
    await request(app.getHttpServer()).patch(endpoint).set('x-test-user-id', created.body.id).send({}).expect(400);
    await request(app.getHttpServer()).patch(endpoint).set('x-test-user-id', created.body.id).send({ email: 'invalid-email' }).expect(400);
    await request(app.getHttpServer()).patch('/api/users/invalid').set('x-test-user-id', created.body.id).send({ email: 'valid@example.test' }).expect(400);
    const disabled = usersById.get(created.body.id)?.disable();
    expect(disabled).toBeDefined();
    usersById.set(created.body.id, disabled!);
    await request(app.getHttpServer()).patch(endpoint).set('x-test-user-id', created.body.id).send({ email: 'user@example.test' }).expect(403);
    await request(app.getHttpServer()).patch(endpoint).set('x-test-user-id', created.body.id).send({ email: 'blocked@example.test' }).expect(403);
    expect(repository.updateEmail).not.toHaveBeenCalled();
  });

  it('deshabilita un usuario activo sin exponer datos sensibles', async () => {
    const created = await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.com', password: 'contraseña válida' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}/disable`).expect(200).expect(({ body }) => {
      expect(body).toEqual({ id: created.body.id, status: 'DISABLED' });
      ['password', 'passwordHash', 'refreshToken', 'tokenHash', 'memberships'].forEach((property) => expect(body).not.toHaveProperty(property));
    });
    expect(usersById.get(created.body.id)?.status).toBe(UserStatus.DISABLED);
  });

  it('deshabilita de forma idempotente y valida el identificador', async () => {
    const created = await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.com', password: 'contraseña válida' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}/disable`).expect(200);
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}/disable`).expect(200);
    await request(app.getHttpServer()).patch('/api/users/not-a-uuid/disable').expect(400);
    await request(app.getHttpServer()).patch(`/api/users/${randomUUID()}/disable`).expect(404);
  });
});
