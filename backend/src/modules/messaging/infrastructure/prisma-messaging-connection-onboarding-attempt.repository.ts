import { Injectable } from '@nestjs/common';
import { MessagingConnectionOnboardingStatus as PrismaStatus } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { MessagingConnectionOnboardingAttemptRecord, MessagingConnectionOnboardingAttemptRepository } from '../domain/messaging-connection-onboarding-attempt.repository';
import { MessagingConnectionOnboardingStatus } from '../domain/messaging-connection-onboarding-status.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

@Injectable()
export class PrismaMessagingConnectionOnboardingAttemptRepository implements MessagingConnectionOnboardingAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    businessId: string;
    initiatedByUserId?: string | null;
    provider: MessagingConnectionProvider;
    channel: MessagingChannel;
    stateHash: string;
    expiresAt: Date;
  }): Promise<MessagingConnectionOnboardingAttemptRecord> {
    return this.map(await this.prisma.messagingConnectionOnboardingAttempt.create({
      data: {
        businessId: input.businessId,
        initiatedByUserId: input.initiatedByUserId ?? null,
        provider: input.provider,
        channel: input.channel,
        stateHash: input.stateHash,
        expiresAt: input.expiresAt,
      },
    }));
  }

  async findByIdAndBusiness(input: { attemptId: string; businessId: string }): Promise<MessagingConnectionOnboardingAttemptRecord | null> {
    const row = await this.prisma.messagingConnectionOnboardingAttempt.findFirst({ where: { id: input.attemptId, businessId: input.businessId } });
    return row ? this.map(row) : null;
  }

  async claim(input: { attemptId: string; businessId: string; stateHash: string; now: Date; processingTimeoutMs: number }): Promise<boolean> {
    const staleAt = new Date(input.now.getTime() - input.processingTimeoutMs);
    const updated = await this.prisma.messagingConnectionOnboardingAttempt.updateMany({
      where: {
        id: input.attemptId,
        businessId: input.businessId,
        stateHash: input.stateHash,
        expiresAt: { gt: input.now },
        OR: [
          { status: PrismaStatus.PENDING },
          { status: PrismaStatus.PROCESSING, processingStartedAt: { lt: staleAt } },
        ],
      },
      data: { status: PrismaStatus.PROCESSING, processingStartedAt: input.now },
    });
    return updated.count === 1;
  }

  async markCompleted(input: { attemptId: string; businessId: string; connectionId: string; completedAt: Date }): Promise<void> {
    await this.prisma.messagingConnectionOnboardingAttempt.updateMany({
      where: { id: input.attemptId, businessId: input.businessId, status: PrismaStatus.PROCESSING },
      data: { status: PrismaStatus.COMPLETED, connectionId: input.connectionId, completedAt: input.completedAt, processingStartedAt: null },
    });
  }

  async markFailed(input: { attemptId: string; businessId: string }): Promise<void> {
    await this.prisma.messagingConnectionOnboardingAttempt.updateMany({
      where: { id: input.attemptId, businessId: input.businessId, status: PrismaStatus.PROCESSING },
      data: { status: PrismaStatus.FAILED, processingStartedAt: null },
    });
  }

  async markExpired(input: { attemptId: string; businessId: string }): Promise<void> {
    await this.prisma.messagingConnectionOnboardingAttempt.updateMany({
      where: { id: input.attemptId, businessId: input.businessId, status: { in: [PrismaStatus.PENDING, PrismaStatus.PROCESSING] } },
      data: { status: PrismaStatus.EXPIRED, processingStartedAt: null },
    });
  }

  private map(row: {
    id: string;
    businessId: string;
    initiatedByUserId: string | null;
    provider: string;
    channel: string;
    stateHash: string;
    status: string;
    expiresAt: Date;
    processingStartedAt: Date | null;
    createdAt: Date;
    completedAt: Date | null;
    connectionId: string | null;
  }): MessagingConnectionOnboardingAttemptRecord {
    return {
      id: row.id,
      businessId: row.businessId,
      initiatedByUserId: row.initiatedByUserId,
      provider: row.provider as MessagingConnectionProvider,
      channel: row.channel as MessagingChannel,
      stateHash: row.stateHash,
      status: row.status as MessagingConnectionOnboardingStatus,
      expiresAt: row.expiresAt,
      processingStartedAt: row.processingStartedAt,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      connectionId: row.connectionId,
    };
  }
}
