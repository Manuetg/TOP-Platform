import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import type { ResourceQuota } from '../application/resource-quota';
import type { SubscriptionRepository, SubscriptionSnapshot } from '../application/subscription.repository';

@Injectable()
export class PrismaSubscriptionRepository implements SubscriptionRepository, ResourceQuota {
  constructor(private readonly prisma: PrismaService) {}

  private ensure(client: Prisma.TransactionClient, businessId: string) {
    // Existing businesses are backfilled; new businesses receive the persisted
    // default plan lazily. An absent plan fails closed, never grants unlimited use.
    return client.businessSubscription.upsert({ where: { businessId }, create: { businessId, planCode: 'TOP_INITIAL' }, update: {}, include: { plan: true } });
  }
  async get(businessId: string): Promise<SubscriptionSnapshot> { return this.ensure(this.prisma, businessId); }
  async requestUpgrade(businessId: string, actorId: string): Promise<SubscriptionSnapshot> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lock(transaction, businessId);
      const subscription = await this.ensure(transaction, businessId);
      if (subscription.upgradeRequestedAt) return subscription;
      return transaction.businessSubscription.update({ where: { businessId }, data: { upgradeRequestedAt: new Date(), upgradeRequestedBy: actorId }, include: { plan: true } });
    });
  }
  async allocate<T>(businessId: string, write: (maximum: number, transaction: unknown) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lock(transaction, businessId);
      const subscription = await this.ensure(transaction, businessId);
      return write(subscription.plan.maxResources, transaction);
    });
  }
  private async lock(transaction: Prisma.TransactionClient, businessId: string): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${businessId}, 0))`;
  }
}
