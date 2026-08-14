import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { PrismaRatePlanRepository } from './prisma-rate-plan.repository';

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  businessId: '22222222-2222-4222-8222-222222222222',
  name: 'Plan', description: null, baseNightlyAmountMinor: 450000,
  status: RatePlanStatus.ACTIVE, validFrom: new Date('2026-08-01T00:00:00.000Z'), validTo: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  business: { currency: 'PYG' },
  resources: [{ resource: { id: '33333333-3333-4333-8333-333333333333', name: 'Cabana', internalCode: 'CAB-1' } }],
};
const include = { business: { select: { currency: true } }, resources: { include: { resource: true }, orderBy: { resourceId: 'asc' } } };
const data = { businessId: row.businessId, name: row.name, description: null, baseNightlyAmountMinor: 450000, currency: 'PYG', validFrom: '2026-08-01', validTo: null, resourceIds: [row.resources[0].resource.id] };

describe('PrismaRatePlanRepository', () => {
  const create = jest.fn(); const update = jest.fn(); const findUniqueOrThrow = jest.fn(); const findFirst = jest.fn();
  const deleteMany = jest.fn(); const createMany = jest.fn(); const transaction = jest.fn();
  const repository = new PrismaRatePlanRepository({ $transaction: transaction, ratePlan: { findFirst } } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) => callback({
      ratePlan: { create, update, findUniqueOrThrow, findFirst }, ratePlanResource: { deleteMany, createMany },
    }));
    create.mockResolvedValue(row); update.mockResolvedValue(row); findUniqueOrThrow.mockResolvedValue(row);
    deleteMany.mockResolvedValue({ count: 1 }); createMany.mockResolvedValue({ count: 1 });
  });

  it('creates atomically with exact data and maps the public entity', async () => {
    const result = await repository.create(data);
    expect(create).toHaveBeenCalledWith({
      data: { businessId: data.businessId, name: data.name, description: null, baseNightlyAmountMinor: data.baseNightlyAmountMinor, validFrom: new Date('2026-08-01T00:00:00.000Z'), validTo: null, resources: { createMany: { data: [{ resourceId: row.resources[0].resource.id }] } } }, include,
    });
    expect(result).toMatchObject({ id: row.id, currency: 'PYG', status: RatePlanStatus.ACTIVE, validFrom: '2026-08-01', resources: [{ id: row.resources[0].resource.id, internalCode: 'CAB-1' }] });
  });

  it('updates without replacing relations when resourceIds is undefined', async () => {
    await repository.update({ id: row.id, ...data, resourceIds: undefined });
    expect(update).toHaveBeenCalledWith({ where: { id: row.id }, data: { name: data.name, description: null, baseNightlyAmountMinor: 450000, validFrom: new Date('2026-08-01T00:00:00.000Z'), validTo: null } });
    expect(deleteMany).not.toHaveBeenCalled(); expect(createMany).not.toHaveBeenCalled();
    expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: row.id }, include });
  });

  it('finds by the exact Business scope and maps non-null validity dates', async () => {
    findFirst.mockResolvedValue({ ...row, validTo: new Date('2026-09-01T00:00:00.000Z') });
    const result = await repository.findByIdAndBusinessId(row.id, row.businessId);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: row.id, businessId: row.businessId }, include });
    expect(result).toMatchObject({ id: row.id, validFrom: '2026-08-01', validTo: '2026-09-01' });
    findFirst.mockResolvedValueOnce(null);
    await expect(repository.findByIdAndBusinessId(row.id, row.businessId)).resolves.toBeNull();
  });

  it('replaces relations atomically when resourceIds is present', async () => {
    const resourceIds = [row.resources[0].resource.id, '44444444-4444-4444-8444-444444444444'];
    await repository.update({ id: row.id, ...data, resourceIds });
    expect(deleteMany).toHaveBeenCalledWith({ where: { ratePlanId: row.id } });
    expect(createMany).toHaveBeenCalledWith({ data: resourceIds.map((resourceId) => ({ ratePlanId: row.id, resourceId })) });
  });

  it('clears relations without creating new rows when resourceIds is empty', async () => {
    await repository.update({ id: row.id, ...data, resourceIds: [] });
    expect(deleteMany).toHaveBeenCalledWith({ where: { ratePlanId: row.id } });
    expect(createMany).not.toHaveBeenCalled();
  });

  it.each(['update', 'delete', 'create'])('propagates transactional %s failures', async (operation) => {
    const failure = new Error('persistence');
    if (operation === 'update') update.mockRejectedValueOnce(failure);
    if (operation === 'delete') deleteMany.mockRejectedValueOnce(failure);
    if (operation === 'create') createMany.mockRejectedValueOnce(failure);
    await expect(repository.update({ id: row.id, ...data, resourceIds: [row.resources[0].resource.id] })).rejects.toBe(failure);
  });
});
