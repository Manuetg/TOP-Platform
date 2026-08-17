import { RatePlan } from '../../../src/modules/pricing/domain/rate-plan.entity';
import { RatePlanStatus } from '../../../src/modules/pricing/domain/rate-plan-status.enum';
import type { CreateRatePlanData, RatePlanRepository, UpdateRatePlanData } from '../../../src/modules/pricing/domain/rate-plan.repository';
import { getResourceFake } from './resource-repository.fake';

let ratePlans = new Map<string, RatePlan>();
const defaultId = '99999999-9999-4999-8999-999999999999';
function resourcesFor(ids: string[]) { return ids.map((id) => { const resource = getResourceFake(id); return { id, name: resource?.name ?? 'Resource', internalCode: resource?.internalCode ?? 'RESOURCE' }; }); }

export function resetRatePlanRepositoryFake(): void { ratePlans = new Map(); }
export function archiveRatePlanFake(id: string): void {
  const plan = ratePlans.get(id); if (!plan) return;
  ratePlans.set(id, RatePlan.create({ id: plan.id, businessId: plan.businessId, name: plan.name, description: plan.description, baseNightlyAmountMinor: plan.baseNightlyAmountMinor, currency: plan.currency, status: RatePlanStatus.ARCHIVED, validFrom: plan.validFrom, validTo: plan.validTo, resources: plan.resources, createdAt: plan.createdAt, updatedAt: plan.updatedAt }));
}
export function isRatePlanResourceAssignedFake(ratePlanId: string, resourceId: string): boolean {
  return ratePlans.get(ratePlanId)?.resources.some((resource) => resource.id === resourceId) ?? false;
}
export const ratePlanRepositoryFake: RatePlanRepository = {
  create: (data: CreateRatePlanData): Promise<RatePlan> => {
    const plan = RatePlan.create({ id: defaultId, ...data, status: RatePlanStatus.ACTIVE, resources: resourcesFor(data.resourceIds), createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-08-01T00:00:00.000Z') });
    ratePlans.set(plan.id, plan); return Promise.resolve(plan);
  },
  findByIdAndBusinessId: (id, businessId): Promise<RatePlan | null> => Promise.resolve(ratePlans.get(id)?.businessId === businessId ? ratePlans.get(id) ?? null : null),
  update: (data: UpdateRatePlanData): Promise<RatePlan> => {
    const current = ratePlans.get(data.id); if (!current) return Promise.reject(new Error('RatePlan not found.'));
    const plan = RatePlan.create({ id: current.id, businessId: current.businessId, name: data.name, description: data.description, baseNightlyAmountMinor: data.baseNightlyAmountMinor, currency: current.currency, status: current.status, validFrom: data.validFrom, validTo: data.validTo, resources: data.resourceIds === undefined ? current.resources : resourcesFor(data.resourceIds), createdAt: current.createdAt, updatedAt: new Date() });
    ratePlans.set(plan.id, plan); return Promise.resolve(plan);
  },
};
