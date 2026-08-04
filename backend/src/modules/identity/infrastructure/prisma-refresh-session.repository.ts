import { Injectable } from '@nestjs/common';
import type { RefreshSession as PrismaRefreshSession } from '@prisma/client';
import { RefreshSession } from '../domain/refresh-session.entity';
import type { CreateRefreshSessionData, RefreshSessionRepository } from '../domain/refresh-session.repository';
import { PrismaIdentityService } from './prisma-identity.service';

@Injectable()
export class PrismaRefreshSessionRepository implements RefreshSessionRepository {
  constructor(private readonly prisma: PrismaIdentityService) {}

  async create(data: CreateRefreshSessionData): Promise<RefreshSession> {
    return this.toDomain(await this.prisma.refreshSession.create({ data }));
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const session = await this.prisma.refreshSession.findUnique({ where: { tokenHash } });
    return session ? this.toDomain(session) : null;
  }

  async revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<void> {
    const session = await this.prisma.refreshSession.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt) return;
    await this.prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt } });
  }

  async rotate(previousSessionId: string, nextSession: CreateRefreshSessionData, revokedAt: Date): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.refreshSession.create({ data: nextSession });
      await transaction.refreshSession.update({ where: { id: previousSessionId }, data: { revokedAt, replacedBySessionId: created.id } });
    });
  }

  private toDomain(session: PrismaRefreshSession): RefreshSession {
    return RefreshSession.create({ id: session.id, userId: session.userId, tokenHash: session.tokenHash, expiresAt: session.expiresAt, revokedAt: session.revokedAt, replacedBySessionId: session.replacedBySessionId, createdAt: session.createdAt, updatedAt: session.updatedAt });
  }
}
