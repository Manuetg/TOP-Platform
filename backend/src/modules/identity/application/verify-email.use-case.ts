import { Injectable } from '@nestjs/common';
import { PrismaIdentityService } from '../infrastructure/prisma-identity.service';
import { CryptoEmailVerificationTokenService } from '../infrastructure/crypto-email-verification-token.service';
export class InvalidEmailVerificationTokenError extends Error {}
@Injectable()
export class VerifyEmailUseCase {
  constructor(private readonly prisma: PrismaIdentityService, private readonly tokens: CryptoEmailVerificationTokenService) {}
  async execute(rawToken: unknown): Promise<{ status: 'EMAIL_VERIFIED' }> {
    if (typeof rawToken !== 'string' || !rawToken.trim()) throw new InvalidEmailVerificationTokenError('El enlace de verificación no es válido.');
    const now = new Date();
    const token = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: this.tokens.hash(rawToken.trim()) } });
    if (!token || token.usedAt || token.expiresAt <= now) throw new InvalidEmailVerificationTokenError('El enlace de verificación no es válido.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
      await tx.emailVerificationToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: now } });
    });
    return { status: 'EMAIL_VERIFIED' };
  }
}
