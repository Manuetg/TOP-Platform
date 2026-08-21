import { PrismaAvailabilityRulesRepository } from './prisma-availability-rules.repository';

const businessId = '11111111-1111-4111-8111-111111111111';
describe('PrismaAvailabilityRulesRepository', () => {
  const availabilityRule = { findUnique: jest.fn(), upsert: jest.fn() };
  const repository = new PrismaAvailabilityRulesRepository({ availabilityRule } as never);
  beforeEach(() => jest.resetAllMocks());
  it('finds by the exact business scope', async () => { availabilityRule.findUnique.mockResolvedValueOnce(null); await expect(repository.findByBusinessId(businessId)).resolves.toBeNull(); expect(availabilityRule.findUnique).toHaveBeenCalledWith({ where: { businessId } }); });
  it('upserts every configurable field without persisting availability', async () => { const rules = { businessId, pendingBlocksAvailability: false, bufferBeforeDays: 1, bufferAfterDays: 2 }; availabilityRule.upsert.mockResolvedValueOnce(rules); await expect(repository.save(rules)).resolves.toEqual(rules); expect(availabilityRule.upsert).toHaveBeenCalledWith({ where: { businessId }, create: rules, update: { pendingBlocksAvailability: false, bufferBeforeDays: 1, bufferAfterDays: 2 } }); });
});
