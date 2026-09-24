import { Argon2PasswordHasher } from '../../src/modules/identity/infrastructure/argon2-password-hasher';
import { CryptoEmailVerificationTokenService } from '../../src/modules/identity/infrastructure/crypto-email-verification-token.service';
import { PrismaIdentityService } from '../../src/modules/identity/infrastructure/prisma-identity.service';
import { SignupRateLimiter } from '../../src/modules/identity/application/signup-rate-limiter';
import { SignupUseCase } from '../../src/modules/identity/application/signup.use-case';
import { ResendVerificationUseCase } from '../../src/modules/identity/application/resend-verification.use-case';
import { cleanTestDatabase } from './support/clean-test-database';
import { ConfigService } from '@nestjs/config';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const isTestDatabase = databaseUrl ? new URL(databaseUrl).pathname.toLowerCase().includes('test') : false;

describeWithPostgres('SignupUseCase con PostgreSQL', () => {
  const prisma = new PrismaIdentityService();
  const email = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn() };
  const useCase = new SignupUseCase(prisma, new Argon2PasswordHasher(), email, new CryptoEmailVerificationTokenService(new ConfigService()), new SignupRateLimiter());

  beforeAll(async () => { if (!isTestDatabase) throw new Error('Signup integration requiere top_test.'); await prisma.$connect(); });
  beforeEach(async () => { await cleanTestDatabase(prisma, databaseUrl); jest.clearAllMocks(); });
  afterEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('persiste el onboarding completo sin sesión y sólo guarda el hash del token', async () => {
    const result = await useCase.execute({ displayName: ' Ana Pérez ', email: ' ANA@EXAMPLE.COM ', password: 'Password12345!', businessName: ' Casa TOP ', timezone: 'America/Asuncion' });
    expect(result).toEqual({ status: 'EMAIL_VERIFICATION_REQUIRED', email: 'ana@example.com' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' }, include: { localCredential: true, memberships: true, emailVerificationTokens: true } });
    const business = await prisma.business.findFirstOrThrow({ where: { name: 'Casa TOP' }, include: { subscription: true } });
    expect(user).toMatchObject({ displayName: 'Ana Pérez', status: 'ACTIVE', emailVerifiedAt: null });
    expect(user.localCredential?.passwordHash).toBeTruthy();
    expect(user.localCredential?.passwordHash).not.toContain('Password12345!');
    expect(user.memberships).toEqual([expect.objectContaining({ businessId: business.id, role: 'OWNER' })]);
    expect(business).toMatchObject({ status: 'ACTIVE', timezone: 'America/Asuncion', currency: 'PYG', subscription: { planCode: 'TOP_INITIAL' } });
    expect(user.emailVerificationTokens).toHaveLength(1);
    expect(user.emailVerificationTokens[0]).toMatchObject({ usedAt: null });
    expect(user.emailVerificationTokens[0].tokenHash).not.toContain('ana@example.com');
    expect(await prisma.refreshSession.count({ where: { userId: user.id } })).toBe(0);
    expect(email.sendEmailVerification).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.com', verificationUrl: expect.stringContaining('/verify-email?token=') }));
  });

  it('revierte toda la transacción si falla la suscripción', async () => {
    const transactionalPrisma = Object.create(prisma) as PrismaIdentityService;
    const realTransaction = prisma.$transaction.bind(prisma);
    transactionalPrisma.$transaction = ((callback: (transaction: unknown) => Promise<void>) => realTransaction(async (transaction) => {
      const failingTransaction = Object.create(transaction) as typeof transaction;
      Object.defineProperty(failingTransaction, 'businessSubscription', { value: { create: jest.fn().mockRejectedValue(new Error('subscription failure')) } });
      return callback(failingTransaction);
    })) as PrismaIdentityService['$transaction'];
    const failingUseCase = new SignupUseCase(transactionalPrisma, new Argon2PasswordHasher(), email, new CryptoEmailVerificationTokenService(new ConfigService()), new SignupRateLimiter());

    await expect(failingUseCase.execute({ displayName: 'Rollback User', email: 'rollback@example.com', password: 'Password12345!', businessName: 'Rollback Business', timezone: 'America/Asuncion' })).rejects.toThrow('subscription failure');
    Object.defineProperty(prisma, '$transaction', { value: realTransaction, configurable: true });
    const user = await prisma.user.findUnique({ where: { email: 'rollback@example.com' } });
    expect(user).toBeNull();
    expect(await prisma.business.count({ where: { name: 'Rollback Business' } })).toBe(0);
    expect(await prisma.localCredential.count()).toBe(0);
    expect(await prisma.userBusinessMembership.count()).toBe(0);
    expect(await prisma.businessSubscription.count()).toBe(0);
    expect(await prisma.emailVerificationToken.count()).toBe(0);
    expect(await prisma.refreshSession.count()).toBe(0);
  });

  it('conserva el onboarding si falla el delivery de Signup después del commit', async () => {
    email.sendEmailVerification.mockRejectedValueOnce(new Error('smtp unavailable'));
    const result = await useCase.execute({ displayName: 'Delivery User', email: 'delivery@example.com', password: 'Password12345!', businessName: 'Delivery Business', timezone: 'America/Asuncion' });
    expect(result).toEqual({ status: 'EMAIL_VERIFICATION_REQUIRED', email: 'delivery@example.com' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'delivery@example.com' }, include: { localCredential: true, memberships: true, emailVerificationTokens: true } });
    expect(user).toMatchObject({ emailVerifiedAt: null, localCredential: expect.objectContaining({ passwordHash: expect.any(String) }) });
    expect(user.memberships).toEqual([expect.objectContaining({ role: 'OWNER' })]);
    expect(await prisma.business.count({ where: { name: 'Delivery Business' } })).toBe(1);
    expect(await prisma.businessSubscription.count()).toBe(1);
    expect(user.emailVerificationTokens).toHaveLength(1);
    expect(await prisma.refreshSession.count()).toBe(0);
  });

  it('conserva el onboarding y el token nuevo si falla el delivery de Resend', async () => {
    const user = await prisma.user.create({ data: { email: 'resend-delivery@example.com', status: 'ACTIVE', emailVerifiedAt: null } });
    const business = await prisma.business.create({ data: { name: 'Resend Delivery Business' } });
    await prisma.userBusinessMembership.create({ data: { userId: user.id, businessId: business.id, role: 'OWNER' } });
    await prisma.businessSubscription.create({ data: { businessId: business.id, planCode: 'TOP_INITIAL' } });
    email.sendEmailVerification.mockRejectedValueOnce(new Error('smtp unavailable'));
    const resend = new ResendVerificationUseCase(prisma, new CryptoEmailVerificationTokenService(new ConfigService()), email, new SignupRateLimiter());
    await expect(resend.execute('resend-delivery@example.com')).resolves.toEqual({ status: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' });
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { memberships: true, emailVerificationTokens: true } });
    expect(persisted.emailVerifiedAt).toBeNull();
    expect(persisted.memberships).toHaveLength(1);
    expect(persisted.emailVerificationTokens).toHaveLength(1);
    expect(await prisma.business.count({ where: { id: business.id } })).toBe(1);
    expect(await prisma.businessSubscription.count({ where: { businessId: business.id } })).toBe(1);
  });
});
