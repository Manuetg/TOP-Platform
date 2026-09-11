import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { GetBusinessDashboardUseCase } from '../application/get-business-dashboard.use-case';
import {
  OccupancyKpiInputError,
  OccupancyKpiInvariantError,
  OccupancyKpiNotFoundError,
} from '../application/get-occupancy-kpi.use-case';
import {
  ReservationsKpiInputError,
  ReservationsKpiNotFoundError,
} from '../application/get-reservations-kpi.use-case';
import {
  RevenueKpiInputError,
  RevenueKpiNotFoundError,
} from '../application/get-revenue-kpi.use-case';
import { DashboardController } from './dashboard.controller';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const query = { from: '2026-09-01', to: '2026-09-10' };
const dashboard = {
  occupancy: {
    occupiedResourceNights: 1,
    sellableResourceNights: 2,
    occupancyRateBasisPoints: 5000,
  },
  revenue: { currency: 'PYG', amountMinor: 500_000 },
  reservations: {
    total: 1,
    byStatus: {
      DRAFT: 0,
      PENDING: 0,
      CONFIRMED: 1,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    },
  },
};

describe('DashboardController', () => {
  const execute = jest.fn();
  const controller = new DashboardController({
    execute,
  } as unknown as GetBusinessDashboardUseCase);

  beforeEach(() => {
    jest.resetAllMocks();
    execute.mockResolvedValue(dashboard);
  });

  it('returns the public response unchanged and delegates the common input', async () => {
    await expect(controller.get(businessId, query)).resolves.toEqual(dashboard);
    expect(execute).toHaveBeenCalledWith({ businessId, ...query });
  });

  it.each([
    new OccupancyKpiInputError('invalid occupancy input'),
    new RevenueKpiInputError('invalid revenue input'),
    new ReservationsKpiInputError('invalid reservations input'),
  ])('maps KPI input errors to 400', async (error) => {
    execute.mockRejectedValueOnce(error);
    await expect(controller.get(businessId, query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    new OccupancyKpiNotFoundError('missing business'),
    new RevenueKpiNotFoundError('missing business'),
    new ReservationsKpiNotFoundError('missing business'),
  ])('maps KPI Business lookup errors to 404', async (error) => {
    execute.mockRejectedValueOnce(error);
    await expect(controller.get(businessId, query)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('preserves invariant errors as internal failures', async () => {
    const error = new OccupancyKpiInvariantError('inconsistent projection');
    execute.mockRejectedValueOnce(error);
    await expect(controller.get(businessId, query)).rejects.toBe(error);
  });
});
