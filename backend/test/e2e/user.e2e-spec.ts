import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { USER_REPOSITORY } from '../../src/modules/identity/domain/user.repository';
import { User } from '../../src/modules/identity/domain/user.entity';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';

describe('User endpoint', () => { let app: INestApplication; const users = new Map<string, User>(); const repository = { findByEmail: (email: string): Promise<User | null> => Promise.resolve(users.get(email) ?? null), create: ({ email }: { email: string; passwordHash: string }): Promise<User> => { const now = new Date(); const user = User.create({ id: randomUUID(), email, status: UserStatus.ACTIVE, createdAt: now, updatedAt: now }); users.set(email, user); return Promise.resolve(user); } };
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(USER_REPOSITORY).useValue(repository).compile(); app = module.createNestApplication(); configureApplication(app); await app.init(); }); afterAll(async () => app.close()); beforeEach(() => users.clear());
  it('crea, normaliza y no expone secretos', async () => { await request(app.getHttpServer()).post('/api/users').send({ email: ' USER+demo@Example.COM ', password: 'contraseña válida' }).expect(201).expect(({ body }) => { expect(body.email).toBe('user+demo@example.com'); expect(body.status).toBe('ACTIVE'); expect(body).not.toHaveProperty('password'); expect(body).not.toHaveProperty('passwordHash'); }); });
  it.each([{ email: '', password: 'contraseña válida' }, { email: 'invalido', password: 'contraseña válida' }, { email: 'a@b.com', password: 'x'.repeat(11) }, { email: 'a@b.com', password: 'x'.repeat(129) }])('rechaza datos inválidos', async (body) => { await request(app.getHttpServer()).post('/api/users').send(body).expect(400); });
  it('rechaza duplicados normalizados', async () => { await request(app.getHttpServer()).post('/api/users').send({ email: 'user@example.com', password: 'contraseña válida' }).expect(201); await request(app.getHttpServer()).post('/api/users').send({ email: ' USER@EXAMPLE.COM ', password: 'contraseña válida' }).expect(409); });
});
