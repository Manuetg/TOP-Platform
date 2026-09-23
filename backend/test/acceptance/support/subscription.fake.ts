import { assertResourceCapacity, type ResourceQuota } from '../../../src/modules/subscription/subscription.contract';
import type { SubscriptionRepository, SubscriptionSnapshot } from '../../../src/modules/subscription/application/subscription.repository';
import { resourceRepositoryFake } from './resource-repository.fake';
import { ResourceStatus } from '../../../src/modules/resource/resource.contract';
const requests = new Map<string, Date>();
export const subscriptionSnapshot = (businessId: string): SubscriptionSnapshot => ({ plan: { code: 'TOP_INITIAL', name: 'TOP Inicial', maxResources: 10 }, upgradeRequestedAt: requests.get(businessId) ?? null });
export const subscriptionRepositoryFake: SubscriptionRepository = {
  get: (id) => Promise.resolve(subscriptionSnapshot(id)),
  requestUpgrade: (id) => { if (!requests.has(id)) requests.set(id, new Date('2026-09-23Z')); return Promise.resolve(subscriptionSnapshot(id)); },
};
export const resourceUsageFake = { countOperational: async (id: string) => (await resourceRepositoryFake.listByBusinessId(id)).filter((item) => item.status !== ResourceStatus.ARCHIVED).length };
export const resourceQuotaFake: ResourceQuota = { allocate: async (id, write) => { assertResourceCapacity(await resourceUsageFake.countOperational(id), 10); return write(10, {}); } };
export function resetSubscriptionFake() { requests.clear(); }
