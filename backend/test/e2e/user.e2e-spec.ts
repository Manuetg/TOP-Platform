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

describe('User endpoint', () => {
  let app: INestApplication;
  const users = new Map<string, User>();
  const usersById = new Map<string, User>();
  const repository = {
    findByEmail: (email: string): Promise<User | null> => Promise.resolve(users.get(email) ?? null),
    create: ({ email }: { email: string; passwordHash: string }): Promise<User> => {
      const now = new Date();
      const user = User.create({ id: randomUUID(), email, status: UserStatus.ACTIVE, createdAt: now, updatedAt: now });
      users.set(email, user);
      usersById.set(user.id, user);
      return Promise.resolve(user);
    },
    updateEmail: (user: User): Promise<User> => {
      const previous = usersById.get(user.id);
      if (previous) users.delete(previous.email);
      users.set(user.email, user);
      usersById.set(user.id, user);
      return Promise.resolve(user);
    },
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
    configureApplication(app, { security: false });
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => { users.clear(); usersById.clear(); });

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

  it('actualiza el email de forma idempotente sin exponer datos sensibles', async () => {
    const created = await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.com', password: 'contraseña válida' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}`).send({ email: ' NUEVO+Demo@Ejemplo.COM ' }).expect(200).expect(({ body }) => {
      expect(body.email).toBe('nuevo+demo@ejemplo.com');
      expect(body).not.toHaveProperty('passwordHash');
    });
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}`).send({ email: 'nuevo+demo@ejemplo.com' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/users/${created.body.id}`).send({}).expect(400);
    await request(app.getHttpServer()).patch('/api/users/invalid').send({ email: 'valid@example.com' }).expect(400);
  });

  it('rechaza email duplicado y usuario inexistente al actualizar', async () => {
    const first = await request(app.getHttpServer()).post('/api/users').send({ email: 'first@example.com', password: 'contraseña válida' }).expect(201);
    await request(app.getHttpServer()).post('/api/users').send({ email: 'second@example.com', password: 'contraseña válida' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/users/${first.body.id}`).send({ email: ' SECOND@EXAMPLE.COM ' }).expect(409);
    await request(app.getHttpServer()).patch(`/api/users/${randomUUID()}`).send({ email: 'other@example.com' }).expect(404);
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
