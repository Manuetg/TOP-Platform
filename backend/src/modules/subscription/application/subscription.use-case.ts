import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { RESOURCE_USAGE_READER, type ResourceUsageReader } from '../../resource/resource.contract';
import { resourceUsage, type ResourceUsage } from '../domain/resource-entitlement';
import { SUBSCRIPTION_REPOSITORY, type SubscriptionRepository } from './subscription.repository';

export class SubscriptionBusinessNotFoundError extends Error {}
export class SubscriptionBusinessUnavailableError extends Error {}
export interface SubscriptionOverview {
  subscription: { planCode: string; planName: string };
  entitlements: { maxResources: number };
  usage: { resources: ResourceUsage };
  upgrade: { status: 'REQUESTED' | 'AVAILABLE'; requestedAt: string | null };
}
@Injectable()
export class SubscriptionUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: SubscriptionRepository, @Inject(RESOURCE_USAGE_READER) private readonly resources: ResourceUsageReader) {}
  private async validate(businessId: string) {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new SubscriptionBusinessNotFoundError('El establecimiento no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new SubscriptionBusinessUnavailableError('El establecimiento no está activo.');
  }
  async get(businessId: string): Promise<SubscriptionOverview> {
    await this.validate(businessId);
    const [subscription, used] = await Promise.all([this.subscriptions.get(businessId), this.resources.countOperational(businessId)]);
    return { subscription: { planCode: subscription.plan.code, planName: subscription.plan.name }, entitlements: { maxResources: subscription.plan.maxResources }, usage: { resources: resourceUsage(used, subscription.plan.maxResources) }, upgrade: { status: subscription.upgradeRequestedAt ? 'REQUESTED' as const : 'AVAILABLE' as const, requestedAt: subscription.upgradeRequestedAt?.toISOString() ?? null } };
  }
  async requestUpgrade(businessId: string, actorId: string): Promise<{ status: 'REQUESTED'; requestedAt: string }> {
    await this.validate(businessId);
    const subscription = await this.subscriptions.requestUpgrade(businessId, actorId);
    return { status: 'REQUESTED' as const, requestedAt: subscription.upgradeRequestedAt!.toISOString() };
  }
}
