import { Block } from '../domain/block.entity';
import { BlockStatus } from '../domain/block-status.enum';
import { BlockType } from '../domain/block-type.enum';
import { PrismaBlockRepository } from './prisma-block.repository';

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  businessId: '22222222-2222-4222-8222-222222222222',
  resourceId: '33333333-3333-4333-8333-333333333333',
  type: BlockType.MAINTENANCE,
  reason: 'Mantenimiento',
  notes: null,
  startsAt: new Date('2026-12-20T10:00:00.000Z'),
  endsAt: new Date('2026-12-21T10:00:00.000Z'),
  status: BlockStatus.SCHEDULED,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const setup = (): { repository: PrismaBlockRepository; create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock } => {
  const create = jest.fn(); const findFirst = jest.fn(); const findMany = jest.fn(); const update = jest.fn();
  return { repository: new PrismaBlockRepository({ block: { create, findFirst, findMany, update } } as never), create, findFirst, findMany, update };
};

describe('PrismaBlockRepository', () => {
  it('creates with exact data and maps every persisted field', async () => {
    const { repository, create } = setup(); create.mockResolvedValueOnce(row);
    const data = { businessId: row.businessId, resourceId: row.resourceId, type: row.type, reason: row.reason, notes: row.notes, startsAt: row.startsAt, endsAt: row.endsAt };
    await expect(repository.create(data)).resolves.toMatchObject(row);
    expect(create).toHaveBeenCalledWith({ data });
  });

  it('finds only within the requested tenant and maps nullable and temporal fields', async () => {
    const { repository, findFirst } = setup(); const mappedRow = { ...row, type: BlockType.OWNER_USE, notes: 'Uso propietario', status: BlockStatus.CANCELLED, cancellationReason: 'Cambio', cancelledAt: new Date('2026-02-01T00:00:00.000Z') }; findFirst.mockResolvedValueOnce(mappedRow).mockResolvedValueOnce(null);
    const found = await repository.findByIdAndBusinessId(row.id, row.businessId);
    expect(findFirst).toHaveBeenNthCalledWith(1, { where: { id: row.id, businessId: row.businessId } });
    expect(found).toMatchObject(mappedRow); expect(found?.startsAt).toBe(mappedRow.startsAt); expect(found?.cancelledAt).toBe(mappedRow.cancelledAt);
    await expect(repository.findByIdAndBusinessId(row.id, '44444444-4444-4444-8444-444444444444')).resolves.toBeNull();
  });

  it.each([
    [{}, { businessId: row.businessId }],
    [{ resourceId: row.resourceId }, { businessId: row.businessId, resourceId: row.resourceId }],
    [{ from: row.startsAt }, { businessId: row.businessId, endsAt: { gt: row.startsAt } }],
    [{ to: row.endsAt }, { businessId: row.businessId, startsAt: { lt: row.endsAt } }],
    [{ resourceId: row.resourceId, from: row.startsAt, to: row.endsAt }, { businessId: row.businessId, resourceId: row.resourceId, endsAt: { gt: row.startsAt }, startsAt: { lt: row.endsAt } }],
  ])('lists with exact scoped semi-open filters', async (filters, where) => {
    const { repository, findMany } = setup(); findMany.mockResolvedValueOnce([row]);
    await expect(repository.listByBusinessId(row.businessId, filters)).resolves.toEqual([expect.objectContaining({ id: row.id })]);
    expect(findMany).toHaveBeenCalledWith({ where, orderBy: [{ startsAt: 'asc' }, { endsAt: 'asc' }, { id: 'asc' }] });
  });

  it('updates only cancellation fields and preserves mapped historical fields', async () => {
    const { repository, update } = setup(); const cancelledAt = new Date('2026-02-01T00:00:00.000Z'); const cancelled = Block.create({ ...row, status: BlockStatus.CANCELLED, cancellationReason: 'Cambio', cancelledAt }); update.mockResolvedValueOnce({ ...row, status: BlockStatus.CANCELLED, cancellationReason: 'Cambio', cancelledAt });
    const result = await repository.update(cancelled);
    expect(update).toHaveBeenCalledWith({ where: { id: row.id }, data: { status: BlockStatus.CANCELLED, cancellationReason: 'Cambio', cancelledAt } });
    expect(result).toMatchObject({ id: row.id, businessId: row.businessId, resourceId: row.resourceId, type: row.type, reason: row.reason, notes: null, status: BlockStatus.CANCELLED, cancellationReason: 'Cambio', cancelledAt, createdAt: row.createdAt });
  });

  it.each(['create', 'findFirst', 'findMany', 'update'] as const)('propagates Prisma errors from %s', async (operation) => {
    const { repository, create, findFirst, findMany, update } = setup(); const error = new Error(`${operation} failed`);
    if (operation === 'create') { create.mockRejectedValueOnce(error); await expect(repository.create({ businessId: row.businessId, resourceId: row.resourceId, type: row.type, reason: row.reason, notes: null, startsAt: row.startsAt, endsAt: row.endsAt })).rejects.toBe(error); }
    if (operation === 'findFirst') { findFirst.mockRejectedValueOnce(error); await expect(repository.findByIdAndBusinessId(row.id, row.businessId)).rejects.toBe(error); }
    if (operation === 'findMany') { findMany.mockRejectedValueOnce(error); await expect(repository.listByBusinessId(row.businessId, {})).rejects.toBe(error); }
    if (operation === 'update') { update.mockRejectedValueOnce(error); await expect(repository.update(Block.create(row))).rejects.toBe(error); }
  });
});
