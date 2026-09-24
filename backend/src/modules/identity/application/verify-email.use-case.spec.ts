import { VerifyEmailUseCase, InvalidEmailVerificationTokenError } from './verify-email.use-case';
import type { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
import type { PrismaIdentityService } from '../infrastructure/prisma-identity.service';

describe('VerifyEmailUseCase', () => {
  const now = new Date('2026-09-23T12:00:00.000Z');
  const tokenService = {
    hash: jest.fn((value: string) => `hash:${value}`),
  };

  const setup = () => {
    const tx = {
      user: { update: jest.fn() },
      emailVerificationToken: { updateMany: jest.fn() },
    };
    const prisma = {
      emailVerificationToken: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const useCase = new VerifyEmailUseCase(
      prisma as unknown as PrismaIdentityService,
      tokenService as unknown as CryptoEmailVerificationTokenService,
    );
    return { useCase, prisma, tx };
  };

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('verifies a valid token, marks it used and invalidates pending tokens', async () => {
    const { useCase, prisma, tx } = setup();
    prisma.emailVerificationToken.findUnique.mockResolvedValue({ userId: 'user-1', usedAt: null, expiresAt: new Date('2026-09-24T12:00:00.000Z') });

    await expect(useCase.execute(' raw-token ')).resolves.toEqual({ status: 'EMAIL_VERIFIED' });
    expect(tokenService.hash).toHaveBeenCalledWith('raw-token');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { emailVerifiedAt: now } });
    expect(tx.emailVerificationToken.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-1', usedAt: null }, data: { usedAt: now } });
  });

  it.each([
    ['missing', null],
    ['used', { userId: 'user-1', usedAt: now, expiresAt: new Date('2026-09-24T12:00:00.000Z') }],
    ['expired', { userId: 'user-1', usedAt: null, expiresAt: new Date('2026-09-23T11:59:59.000Z') }],
  ])('rejects %s tokens without changing the user', async (_label, record) => {
    const { useCase, prisma, tx } = setup();
    prisma.emailVerificationToken.findUnique.mockResolvedValue(record);
    await expect(useCase.execute('token')).rejects.toBeInstanceOf(InvalidEmailVerificationTokenError);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.emailVerificationToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects empty/non-string input before persistence lookup', async () => {
    const { useCase, prisma } = setup();
    await expect(useCase.execute('')).rejects.toBeInstanceOf(InvalidEmailVerificationTokenError);
    await expect(useCase.execute(null)).rejects.toBeInstanceOf(InvalidEmailVerificationTokenError);
    expect(prisma.emailVerificationToken.findUnique).not.toHaveBeenCalled();
  });

  it('uses only the digest for persistence lookup', async () => {
    const { useCase, prisma } = setup();
    prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    await expect(useCase.execute('secret-token')).rejects.toBeInstanceOf(InvalidEmailVerificationTokenError);
    expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: 'hash:secret-token' } });
  });
});
