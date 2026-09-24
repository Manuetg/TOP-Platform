import { ResendVerificationUseCase } from './resend-verification.use-case';
import type { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import type { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import { SignupRateLimiter } from './signup-rate-limiter';

describe('ResendVerificationUseCase', () => {
  const setup = () => {
    const tx = { emailVerificationToken: { updateMany: jest.fn(), create: jest.fn() } };
    const prisma = { user: { findUnique: jest.fn() }, emailVerificationToken: { findFirst: jest.fn() }, $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)) };
    const tokens = { generate: jest.fn().mockReturnValue('new-token'), hash: jest.fn((value: string) => `hash:${value}`), expiresAt: jest.fn().mockReturnValue(new Date('2026-09-24')) };
    const sendEmailVerification = jest.fn();
    const email = { sendPasswordReset: jest.fn(), sendEmailVerification };
    const useCase = new ResendVerificationUseCase(prisma as unknown as PrismaIdentityService, tokens as unknown as CryptoEmailVerificationTokenService, email, new SignupRateLimiter());
    return { useCase, prisma, tx, tokens, email };
  };
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
});
