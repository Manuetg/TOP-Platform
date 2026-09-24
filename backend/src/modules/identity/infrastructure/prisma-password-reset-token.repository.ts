import { Injectable } from '@nestjs/common';
import type { CreatePasswordResetTokenData, PasswordResetTokenRepository } from '../domain/password-reset-token.repository';
import { PrismaIdentityService } from './prisma-identity.service';
import type { PasswordResetChallengeRepository } from '../domain/password-reset-challenge.repository';

@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository, PasswordResetChallengeRepository {
  constructor(private readonly prisma: PrismaIdentityService) {}
  async findLatestPending(userId: string, now: Date): Promise<{ lastSentAt: Date } | null> {
    const challenge = await this.prisma.passwordResetChallenge.findFirst({ where: { userId, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' }, select: { lastSentAt: true } });
    return challenge;
  }
  async invalidatePending(userId: string, now: Date): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    await this.prisma.passwordResetChallenge.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  }
  async create(data: CreatePasswordResetTokenData): Promise<void> { await this.prisma.passwordResetToken.create({ data }); }
  async consumeAndResetPassword(data: { tokenHash: string; passwordHash: string; now: Date }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({ where: { tokenHash: data.tokenHash } });
      if (!token || token.usedAt || token.expiresAt <= data.now) return false;
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: data.now } }, data: { usedAt: data.now } });
      if (claimed.count !== 1) return false;
      await tx.localCredential.update({ where: { userId: token.userId }, data: { passwordHash: data.passwordHash } });
      await tx.passwordResetToken.updateMany({ where: { userId: token.userId, id: { not: token.id }, usedAt: null }, data: { usedAt: data.now } });
      await tx.refreshSession.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: data.now } });
      return true;
    });
  }
  async verifyAndCreateGrant(data: { challengeId: string; codeDigest: string; now: Date; grantHash: string; grantExpiresAt: Date }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.passwordResetChallenge.findUnique({ where: { id: data.challengeId } });
      if (!challenge || challenge.usedAt || challenge.expiresAt <= data.now || challenge.attempts >= challenge.maxAttempts) return false;
      const digestMatches = challenge.codeDigest === data.codeDigest;
      await tx.passwordResetChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, usedAt: digestMatches ? data.now : undefined } });
      if (!digestMatches) return false;
      await tx.passwordResetToken.create({ data: { userId: challenge.userId, tokenHash: data.grantHash, expiresAt: data.grantExpiresAt } });
      return true;
    });
  }
  async createChallenge(data: { userId: string; codeDigest: string; expiresAt: Date; lastSentAt: Date }): Promise<{ id: string }> { return this.prisma.passwordResetChallenge.create({ data, select: { id: true } }); }
}
