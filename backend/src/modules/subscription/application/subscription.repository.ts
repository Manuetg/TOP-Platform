export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');
export interface SubscriptionSnapshot {
  plan: { code: string; name: string; maxResources: number };
  upgradeRequestedAt: Date | null;
}
export interface SubscriptionRepository {
  get(businessId: string): Promise<SubscriptionSnapshot>;
  requestUpgrade(businessId: string, actorId: string): Promise<SubscriptionSnapshot>;
}
