import { Logger } from '@nestjs/common';
import type { OccupancyProjectionReader } from '../../availability/availability.contract';
import { BusinessStatus } from '../../business/business.contract';
import { Business } from '../../business/domain/business.entity';
import type { BusinessRepository } from '../../business/domain/business.repository';
import {
  GetOccupancyKpiUseCase,
  OccupancyKpiInputError,
  OccupancyKpiInvariantError,
  OccupancyKpiNotFoundError,
} from './get-occupancy-kpi.use-case';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const business = Business.create({
  id: businessId,
  businessNumber: null,
  name: 'TOP',
  legalName: null,
  taxId: null,
  timezone: 'America/Asuncion',
  currency: 'PYG',
  status: BusinessStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('GetOccupancyKpiUseCase', () => {
  const findById = jest.fn<ReturnType<BusinessRepository['findById']>, Parameters<BusinessRepository['findById']>>();
  const read = jest.fn<ReturnType<OccupancyProjectionReader['read']>, Parameters<OccupancyProjectionReader['read']>>();
  const businesses: BusinessRepository = {
    create: jest.fn(),
    findById,
    list: jest.fn(),
    update: jest.fn(),
  };
  const subject = new GetOccupancyKpiUseCase(
    businesses,
    { read },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findById.mockResolvedValue(business);
    read.mockResolvedValue({ occupiedResourceNights: 3, sellableResourceNights: 4 });
  });

  it('derives rounded basis points and delegates the Business timezone', async () => {
    await expect(subject.execute({ businessId, from: '2026-09-01', to: '2026-09-05' })).resolves.toEqual({
      occupiedResourceNights: 3,
      sellableResourceNights: 4,
      occupancyRateBasisPoints: 7500,
    });
    expect(read).toHaveBeenCalledWith({ businessId, from: '2026-09-01', to: '2026-09-05', timeZone: 'America/Asuncion' });
  });

  it('rounds deterministically to the nearest basis point', async () => {
    read.mockResolvedValueOnce({ occupiedResourceNights: 2, sellableResourceNights: 3 });
    await expect(subject.execute({ businessId, from: '2026-09-01', to: '2026-09-04' })).resolves.toMatchObject({ occupancyRateBasisPoints: 6667 });
  });

  it('returns null instead of NaN when there is no sellable inventory', async () => {
    read.mockResolvedValueOnce({ occupiedResourceNights: 0, sellableResourceNights: 0 });
    await expect(subject.execute({ businessId, from: '2026-09-01', to: '2026-09-02' })).resolves.toEqual({
      occupiedResourceNights: 0,
      sellableResourceNights: 0,
      occupancyRateBasisPoints: null,
    });
  });

  it('accepts exactly 31 days and future dates', async () => {
    await expect(subject.execute({ businessId, from: '2099-01-01', to: '2099-02-01' })).resolves.toBeDefined();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['2026/09/01', '2026-09-02'],
    ['2026-02-30', '2026-03-02'],
    ['2026-09-02', '2026-09-02'],
    ['2026-09-03', '2026-09-02'],
    ['2026-01-01', '2026-02-02'],
  ])('rejects an invalid period %s..%s', async (from, to) => {
    await expect(subject.execute({ businessId, from, to })).rejects.toBeInstanceOf(OccupancyKpiInputError);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects an invalid Business identifier before lookup', async () => {
    await expect(subject.execute({ businessId: 'invalid', from: '2026-09-01', to: '2026-09-02' })).rejects.toBeInstanceOf(OccupancyKpiInputError);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a missing Business without reading occupancy data', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(subject.execute({ businessId, from: '2026-09-01', to: '2026-09-02' })).rejects.toBeInstanceOf(OccupancyKpiNotFoundError);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { occupiedResourceNights: -1, sellableResourceNights: 1 },
    { occupiedResourceNights: 1, sellableResourceNights: -1 },
    { occupiedResourceNights: 1.5, sellableResourceNights: 2 },
    { occupiedResourceNights: 2, sellableResourceNights: 1 },
  ])('surfaces impossible projection %# without clamping', async (projection) => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    read.mockResolvedValueOnce(projection);
    await expect(subject.execute({ businessId, from: '2026-09-01', to: '2026-09-02' })).rejects.toBeInstanceOf(OccupancyKpiInvariantError);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'occupancy_kpi_invariant_violation', businessId, ...projection }));
    log.mockRestore();
  });
});
