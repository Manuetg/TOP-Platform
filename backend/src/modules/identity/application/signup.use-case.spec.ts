import { SignupUseCase, InvalidSignupInputError, SignupEmailConflictError } from './signup.use-case';
import { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { SignupRateLimiter } from './signup-rate-limiter';
import { Logger } from '@nestjs/common';

describe('SignupUseCase', () => {
  const user = { id: 'user-id' };
  const business = { id: 'business-id' };
  const tx = {
    user: { create: jest.fn().mockResolvedValue(user) },
    localCredential: { create: jest.fn().mockResolvedValue({}) },
    business: { create: jest.fn().mockResolvedValue(business) },
    userBusinessMembership: { create: jest.fn().mockResolvedValue({}) },
    businessSubscription: { create: jest.fn().mockResolvedValue({}) },
    emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
  };
  const transaction = jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaIdentityService;
  const hasher = { hash: jest.fn().mockResolvedValue('password-hash'), verify: jest.fn() };
  const email = { sendPasswordReset: jest.fn(), sendEmailVerification: jest.fn().mockResolvedValue(undefined) };
  const tokenService = new CryptoEmailVerificationTokenService(new ConfigService({ EMAIL_VERIFICATION_TTL_SECONDS: '86400' }));
  const useCase = new SignupUseCase(prisma, hasher, email, tokenService, new SignupRateLimiter());
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('crea onboarding completo sin sesión y envía verificación', async () => {
    await expect(useCase.execute({ displayName: '  Emanuel  ', email: ' USER@Example.com ', password: 'contraseña válida', businessName: ' Cabañas ', timezone: 'America/Asuncion' })).resolves.toEqual({ status: 'EMAIL_VERIFICATION_REQUIRED', email: 'user@example.com' });
    expect(tx.localCredential.create).toHaveBeenCalledWith({ data: { userId: 'user-id', passwordHash: 'password-hash' } });
    expect(tx.userBusinessMembership.create).toHaveBeenCalledWith({ data: { userId: 'user-id', businessId: 'business-id', role: 'OWNER' } });
    expect(tx.businessSubscription.create).toHaveBeenCalledWith({ data: { businessId: 'business-id', planCode: 'TOP_INITIAL' } });
    expect(email.sendEmailVerification).toHaveBeenCalled();
  });
  it.each([{ displayName: '', timezone: 'America/Asuncion' }, { displayName: 'Name', timezone: 'Not/ATimezone' }])('rechaza input inválido', async (input) => {
    await expect(useCase.execute({ displayName: input.displayName, email: 'user@example.com', password: 'contraseña válida', businessName: 'Business', timezone: input.timezone })).rejects.toBeInstanceOf(InvalidSignupInputError);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('mapea email duplicado', async () => {
    transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }));
    await expect(useCase.execute({ displayName: 'Name', email: 'user@example.com', password: 'contraseña válida', businessName: 'Business', timezone: 'America/Asuncion' })).rejects.toBeInstanceOf(SignupEmailConflictError);
  });

  it('consume APP_PUBLIC_URL validada aunque cambie el entorno del proceso', async () => {
    const values: Record<string, unknown> = { NODE_ENV: 'production', APP_PUBLIC_URL: 'https://app.top.test/' };
    const config = new ConfigService(values);
    jest.spyOn(config, 'get').mockImplementation((key: string) => values[key]);
    const configured = new SignupUseCase(prisma, hasher, email, tokenService, new SignupRateLimiter(), config);
    const original = process.env.APP_PUBLIC_URL;
    try {
      process.env.APP_PUBLIC_URL = 'http://unexpected.top.test';
      await configured.execute({ displayName: 'Name', email: 'configured@example.com', password: 'contraseña válida', businessName: 'Business', timezone: 'America/Asuncion' });
      expect(email.sendEmailVerification).toHaveBeenCalledWith(expect.objectContaining({
        verificationUrl: expect.stringMatching(/^https:\/\/app\.top\.test\/verify-email\?token=/) as unknown,
      }));
    } finally {
      if (original === undefined) delete process.env.APP_PUBLIC_URL;
      else process.env.APP_PUBLIC_URL = original;
    }
  });

  it('rechaza APP_PUBLIC_URL faltante en producción al construir el consumidor', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });
    jest.spyOn(config, 'get').mockImplementation((key: string) => key === 'NODE_ENV' ? 'production' : undefined);
    expect(() => new SignupUseCase(prisma, hasher, email, tokenService, new SignupRateLimiter(), config)).toThrow(/APP_PUBLIC_URL/);
  });

  it('no registra datos sensibles del error de entrega', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    email.sendEmailVerification.mockRejectedValueOnce(new Error('smtp://synthetic-user:synthetic-password@host.test verification-token-marker'));
    await expect(useCase.execute({ displayName: 'Name', email: 'delivery@example.com', password: 'contraseña válida', businessName: 'Business', timezone: 'America/Asuncion' })).resolves.toEqual({ status: 'EMAIL_VERIFICATION_REQUIRED', email: 'delivery@example.com' });
    expect(log).toHaveBeenCalledWith('No se pudo entregar el correo de verificación.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-password');
    expect(JSON.stringify(log.mock.calls)).not.toContain('verification-token-marker');
  });
});
