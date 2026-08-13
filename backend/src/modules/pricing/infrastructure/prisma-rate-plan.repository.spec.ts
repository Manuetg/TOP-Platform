import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { PrismaRatePlanRepository } from './prisma-rate-plan.repository';

const row = {
  id: '11111111-1111-4111-8111-111111111111', businessId: '22222222-2222-4222-8222-222222222222', name: 'Plan', description: null,
  baseNightlyAmountMinor: 450000, status: RatePlanStatus.ACTIVE, validFrom: new Date('2026-08-01T00:00:00.000Z'), validTo: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z'), business: { currency: 'PYG' },
  resources: [{ resource: { id: '33333333-3333-4333-8333-333333333333', name: 'Cabaña', internalCode: 'CAB-1' } }],
};
describe('PrismaRatePlanRepository', () => {
  const create = jest.fn(); const transaction = jest.fn();
  const repository = new PrismaRatePlanRepository({ $transaction: transaction } as never);
  const data = { businessId: row.businessId, name: row.name, description: null, baseNightlyAmountMinor: 450000, currency: 'PYG', validFrom: '2026-08-01', validTo: null, resourceIds: [row.resources[0].resource.id] };
  beforeEach(() => { jest.resetAllMocks(); transaction.mockImplementation((callback: (client: { ratePlan: { create: typeof create } }) => Promise<unknown>) => callback({ ratePlan: { create } })); create.mockResolvedValue(row); });
  it('creates atomically with exact data and maps the public entity', async () => {
    const result = await repository.create(data);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { businessId: data.businessId, name: data.name, description: null, baseNightlyAmountMinor: data.baseNightlyAmountMinor, validFrom: new Date('2026-08-01T00:00:00.000Z'), validTo: null, resources: { createMany: { data: [{ resourceId: row.resources[0].resource.id }] } } },
      include: { business: { select: { currency: true } }, resources: { include: { resource: true }, orderBy: { resourceId: 'asc' } } },
    });
    expect(result).toMatchObject({ id: row.id, currency: 'PYG', status: RatePlanStatus.ACTIVE, validFrom: '2026-08-01', validTo: null, resources: [{ id: row.resources[0].resource.id, internalCode: 'CAB-1' }] });
  });
  it('preserves zero resources and propagates transactional persistence errors', async () => {
    const failure = new Error('persistence'); transaction.mockRejectedValueOnce(failure);
    await expect(repository.create({ ...data, resourceIds: [] })).rejects.toBe(failure);
  });
});
