import { Prisma } from '@prisma/client';
import { SeasonalRateOverlapError } from '../application/seasonal-rate.errors';
import { PrismaSeasonalRateRepository } from './prisma-seasonal-rate.repository';

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  ratePlanId: '22222222-2222-4222-8222-222222222222',
  name: 'Navidad',
  amountMinor: 650000,
  startDate: new Date('2026-12-20T00:00:00.000Z'),
  endDate: new Date('2027-01-06T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ratePlan: { business: { currency: 'PYG' } },
};
const input = { ratePlanId: row.ratePlanId, name: row.name, amountMinor: row.amountMinor, startDate: '2026-12-20', endDate: '2027-01-06', currency: 'PYG' };
const include = { ratePlan: { include: { business: { select: { currency: true } } } } };

describe('PrismaSeasonalRateRepository', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const repository = new PrismaSeasonalRateRepository({ seasonalRate: { create, findMany, findFirst } } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    create.mockResolvedValue(row);
    findMany.mockResolvedValue([row]);
    findFirst.mockResolvedValue(null);
  });

  it('creates with exact data and maps all public fields', async () => {
    const result = await repository.create(input);
    expect(create).toHaveBeenCalledWith({
      data: { ratePlanId: input.ratePlanId, name: input.name, amountMinor: input.amountMinor, startDate: new Date('2026-12-20T00:00:00.000Z'), endDate: new Date('2027-01-06T00:00:00.000Z') },
      include,
    });
    expect(result).toMatchObject({ id: row.id, ratePlanId: row.ratePlanId, name: row.name, amountMinor: row.amountMinor, currency: 'PYG', startDate: '2026-12-20', endDate: '2027-01-06', createdAt: row.createdAt, updatedAt: row.updatedAt });
  });

  it('lists in deterministic date order and maps each result', async () => {
    await expect(repository.listByRatePlanId(row.ratePlanId)).resolves.toEqual([expect.objectContaining({ id: row.id, currency: 'PYG' })]);
    expect(findMany).toHaveBeenCalledWith({
      where: { ratePlanId: row.ratePlanId },
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }, { id: 'asc' }],
      include,
    });
  });

  it('queries overlap using strict interval boundaries, allowing contiguous dates', async () => {
    await expect(repository.hasOverlap(row.ratePlanId, '2027-01-06', '2027-01-10')).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: { ratePlanId: row.ratePlanId, startDate: { lt: new Date('2027-01-10T00:00:00.000Z') }, endDate: { gt: new Date('2027-01-06T00:00:00.000Z') } },
    });
    findFirst.mockResolvedValueOnce(row);
    await expect(repository.hasOverlap(row.ratePlanId, '2026-12-25', '2027-01-10')).resolves.toBe(true);
  });

  it('queries seasons outside the proposed RatePlan validity with exact bounds', async () => {
    await expect(repository.hasOutsideValidity(row.ratePlanId, '2026-12-20', null)).resolves.toBe(false);
    expect(findFirst).toHaveBeenLastCalledWith({ where: { ratePlanId: row.ratePlanId, OR: [{ startDate: { lt: new Date('2026-12-20T00:00:00.000Z') } }] } });
    findFirst.mockResolvedValueOnce(row);
    await expect(repository.hasOutsideValidity(row.ratePlanId, null, '2027-01-06')).resolves.toBe(true);
    expect(findFirst).toHaveBeenLastCalledWith({ where: { ratePlanId: row.ratePlanId, OR: [{ endDate: { gt: new Date('2027-01-06T00:00:00.000Z') } }] } });
    await expect(repository.hasOutsideValidity(row.ratePlanId, '2026-12-20', '2027-01-06')).resolves.toBe(false);
    expect(findFirst).toHaveBeenLastCalledWith({ where: { ratePlanId: row.ratePlanId, OR: [{ startDate: { lt: new Date('2026-12-20T00:00:00.000Z') } }, { endDate: { gt: new Date('2027-01-06T00:00:00.000Z') } }] } });
    await expect(repository.hasOutsideValidity(row.ratePlanId, null, null)).resolves.toBe(false);
    expect(findFirst).toHaveBeenLastCalledWith({ where: { ratePlanId: row.ratePlanId, OR: [] } });
  });

  it('maps only the exact exclusion constraint to a domain overlap error', async () => {
    const overlap = new Prisma.PrismaClientKnownRequestError('constraint', {
      code: 'P2004',
      clientVersion: 'test',
      meta: { database_error: 'ERROR: conflicting key constraint "SeasonalRate_rate_plan_date_range_excl"' },
    });
    create.mockRejectedValueOnce(overlap);
    await expect(repository.create(input)).rejects.toThrow(new SeasonalRateOverlapError('La temporada se superpone con una existente.'));
  });

  it('propagates a different 23P01 constraint and other persistence errors', async () => {
    const otherConstraint = new Prisma.PrismaClientKnownRequestError('other constraint', {
      code: 'P2004',
      clientVersion: 'test',
      meta: { database_error: 'ERROR: SQLSTATE 23P01 other_constraint' },
    });
    create.mockRejectedValueOnce(otherConstraint);
    await expect(repository.create(input)).rejects.toBe(otherConstraint);
    const failure = new Error('database unavailable');
    create.mockRejectedValueOnce(failure);
    await expect(repository.create(input)).rejects.toBe(failure);
  });
});
