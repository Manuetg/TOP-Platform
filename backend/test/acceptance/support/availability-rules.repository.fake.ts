import type { AvailabilityRules, AvailabilityRulesRepository } from '../../../src/modules/availability/domain/availability-rules.repository';

const rules = new Map<string, AvailabilityRules>();
export const availabilityRulesRepositoryFake: AvailabilityRulesRepository = { findByBusinessId: (businessId) => Promise.resolve(rules.get(businessId) ?? null), save: (value) => { rules.set(value.businessId, value); return Promise.resolve(value); } };
export const resetAvailabilityRulesRepositoryFake = (): void => rules.clear();
