import { ResendVerificationUseCase } from './resend-verification.use-case';
import type { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import type { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import { SignupRateLimiter } from './signup-rate-limiter';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

describe('ResendVerificationUseCase', () => {
  const setup = (values: Record<string, unknown> = {}) => {
    const tx = { emailVerificationToken: { updateMany: jest.fn(), create: jest.fn() } };
    const prisma = { user: { findUnique: jest.fn() }, emailVerificationToken: { findFirst: jest.fn() }, $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)) };
    const tokens = { generate: jest.fn().mockReturnValue('new-token'), hash: jest.fn((value: string) => `hash:${value}`), expiresAt: jest.fn().mockReturnValue(new Date('2026-09-24')) };
    const sendEmailVerification = jest.fn();
    const email = { sendPasswordReset: jest.fn(), sendEmailVerification };
    const configuration: Record<string, unknown> = { NODE_ENV: 'test', ...values };
    const config = new ConfigService(configuration);
    jest.spyOn(config, 'get').mockImplementation((key: string) => configuration[key]);
    const useCase = new ResendVerificationUseCase(prisma as unknown as PrismaIdentityService, tokens as unknown as CryptoEmailVerificationTokenService, email, new SignupRateLimiter(), config);
    return { useCase, prisma, tx, tokens, email };
  };
  afterEach(() => { jest.restoreAllMocks(); });
  it('rotates the pending token and sends a generic response', async () => {
    const { useCase, prisma, tx, email } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', emailVerifiedAt: null });
    prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
    await expect(useCase.execute(' USER@EXAMPLE.COM ')).resolves.toEqual({ status: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' });
    expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', usedAt: null } }));
    expect(tx.emailVerificationToken.create).toHaveBeenCalled();
    expect(email.sendEmailVerification).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }));
  });
  it.each<{ status: string; emailVerifiedAt: Date | null }>([{ status: 'DISABLED', emailVerifiedAt: null }, { status: 'ACTIVE', emailVerifiedAt: new Date() }])('does not reveal ineligible user', async (user) => {
    const { useCase, prisma, email } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', ...user });
    await expect(useCase.execute('user@example.com')).resolves.toEqual({ status: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' });
    expect(email.sendEmailVerification).not.toHaveBeenCalled();
  });
  it('does not rotate during cooldown', async () => {
    const { useCase, prisma, tokens, email } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', emailVerifiedAt: null });
    prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date() });
    await useCase.execute('user@example.com');
    expect(tokens.generate).not.toHaveBeenCalled();
    expect(email.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('consume URL y cooldown validados en lugar de variables posteriores del proceso', async () => {
    const { useCase, prisma, email } = setup({ APP_PUBLIC_URL: 'https://app.top.test/', EMAIL_VERIFICATION_RESEND_SECONDS: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', emailVerifiedAt: null });
    prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 1_000) });
    const originalUrl = process.env.APP_PUBLIC_URL;
    const originalCooldown = process.env.EMAIL_VERIFICATION_RESEND_SECONDS;
    try {
      process.env.APP_PUBLIC_URL = 'http://unexpected.top.test';
      process.env.EMAIL_VERIFICATION_RESEND_SECONDS = '300';
      await useCase.execute('user@example.com');
      expect(email.sendEmailVerification).toHaveBeenCalledWith(expect.objectContaining({
        verificationUrl: 'https://app.top.test/verify-email?token=new-token',
      }));
    } finally {
      if (originalUrl === undefined) delete process.env.APP_PUBLIC_URL;
      else process.env.APP_PUBLIC_URL = originalUrl;
      if (originalCooldown === undefined) delete process.env.EMAIL_VERIFICATION_RESEND_SECONDS;
      else process.env.EMAIL_VERIFICATION_RESEND_SECONDS = originalCooldown;
    }
  });

  it('aplica el cooldown configurado de 120 segundos', async () => {
    const { useCase, prisma, tokens } = setup({ EMAIL_VERIFICATION_RESEND_SECONDS: 120 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', emailVerifiedAt: null });
    prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 90_000) });
    await useCase.execute('user@example.com');
    expect(tokens.generate).not.toHaveBeenCalled();
  });

  it.each(['-1', '1.5', 'invalid', ''])('rechaza cooldown inválido sin aplicar fallback: %s', (value) => {
    expect(() => setup({ EMAIL_VERIFICATION_RESEND_SECONDS: value })).toThrow(/EMAIL_VERIFICATION_RESEND_SECONDS/);
  });

  it('rechaza URL pública faltante en producción', () => {
    expect(() => setup({ NODE_ENV: 'production' })).toThrow(/APP_PUBLIC_URL/);
  });

  it('no registra datos sensibles del error de entrega', async () => {
    const { useCase, prisma, email } = setup();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE', emailVerifiedAt: null });
    prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
    email.sendEmailVerification.mockRejectedValueOnce(new Error('smtp://synthetic-user:synthetic-password@host.test verification-token-marker'));
    await expect(useCase.execute('user@example.com')).resolves.toEqual({ status: 'VERIFICATION_EMAIL_SENT_IF_ELIGIBLE' });
    expect(log).toHaveBeenCalledWith('No se pudo entregar el correo de verificación.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-password');
    expect(JSON.stringify(log.mock.calls)).not.toContain('verification-token-marker');
  });
});
