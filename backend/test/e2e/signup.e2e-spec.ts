import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { EMAIL_SENDER } from '../../src/modules/identity/domain/email-sender';
import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { cleanTestDatabase } from '../integration/support/clean-test-database';

describe('Signup → Verify → Login', () => {
  let app: INestApplication;
  let prisma: PrismaIdentityService;
  let verificationUrl = '';
  const emailSender = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn(({ verificationUrl: url }: { verificationUrl: string }) => { verificationUrl = url; return Promise.resolve(); }) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_SENDER).useValue(emailSender).compile();
    app = module.createNestApplication();
    configureApplication(app, { security: false });
    prisma = app.get(PrismaIdentityService);
    await app.init();
  });

  beforeEach(async () => { await cleanTestDatabase(prisma, process.env.DATABASE_URL); verificationUrl = ''; jest.clearAllMocks(); });
  afterAll(async () => { await cleanTestDatabase(prisma, process.env.DATABASE_URL); await app.close(); });

  it('requires verification, verifies once, then allows login and rejects duplicate signup', async () => {
    const email = `signup-${Date.now()}@example.com`;
    const password = 'Password12345!';
    await request(app.getHttpServer()).post('/api/auth/signup').send({ displayName: 'E2E User', email, password, businessName: 'E2E Business', timezone: 'America/Asuncion' }).expect(201).expect(({ body }) => {
      expect(body).toEqual({ status: 'EMAIL_VERIFICATION_REQUIRED', email });
      expect(body).not.toHaveProperty('accessToken');
      expect(body).not.toHaveProperty('refreshToken');
    });
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(403);
    const token = new URL(verificationUrl).searchParams.get('token');
    expect(token).toBeTruthy();
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token }).expect(200).expect(({ body }) => expect(body).toEqual({ status: 'EMAIL_VERIFIED' }));
    await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200).expect(({ body }) => { expect(body.accessToken).toBeTruthy(); expect(body.refreshToken).toBeTruthy(); });
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/signup').send({ displayName: 'Other', email, password, businessName: 'Other Business', timezone: 'America/Asuncion' }).expect(409).expect(({ body }) => expect(body).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED', message: 'Ya existe una cuenta con este correo. Iniciá sesión o recuperá tu contraseña.' }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberships: true, emailVerificationTokens: true } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.memberships).toEqual([expect.objectContaining({ role: 'OWNER' })]);
    expect(user.emailVerificationTokens[0].usedAt).not.toBeNull();
    expect(await prisma.businessSubscription.count()).toBe(1);
  });
});
