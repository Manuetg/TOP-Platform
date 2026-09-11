import { BookingStatus } from '../../booking/booking.contract';
import {
  type GetOccupancyKpiUseCase,
  OccupancyKpiInvariantError,
} from './get-occupancy-kpi.use-case';
import type { GetReservationsKpiUseCase } from './get-reservations-kpi.use-case';
import type { GetRevenueKpiUseCase } from './get-revenue-kpi.use-case';
import { GetBusinessDashboardUseCase } from './get-business-dashboard.use-case';

const input = {
  businessId: 'f8c49800-e50e-4d0e-b82b-0b51c09a0001',
  from: '2026-09-01',
  to: '2026-09-10',
};

const occupancy = {
  occupiedResourceNights: 18,
  sellableResourceNights: 25,
  occupancyRateBasisPoints: 7200,
};
const revenue = { currency: 'PYG', amountMinor: 12_500_000 };
const reservations = {
  total: 8,
  byStatus: {
    [BookingStatus.DRAFT]: 1,
    [BookingStatus.PENDING]: 1,
    [BookingStatus.CONFIRMED]: 2,
    [BookingStatus.IN_PROGRESS]: 1,
    [BookingStatus.COMPLETED]: 2,
    [BookingStatus.CANCELLED]: 1,
    [BookingStatus.NO_SHOW]: 0,
  },
};

describe('GetBusinessDashboardUseCase', () => {
  const occupancyExecute = jest.fn();
  const revenueExecute = jest.fn();
  const reservationsExecute = jest.fn();
  const subject = new GetBusinessDashboardUseCase(
    { execute: occupancyExecute } as unknown as GetOccupancyKpiUseCase,
    { execute: revenueExecute } as unknown as GetRevenueKpiUseCase,
    { execute: reservationsExecute } as unknown as GetReservationsKpiUseCase,
  );
  const failingExecutions: Array<[string, jest.Mock]> = [
    ['Occupancy', occupancyExecute],
    ['Revenue', revenueExecute],
    ['Reservations', reservationsExecute],
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    occupancyExecute.mockResolvedValue(occupancy);
    revenueExecute.mockResolvedValue(revenue);
    reservationsExecute.mockResolvedValue(reservations);
  });

  it('composes the three authoritative KPI results without recalculation', async () => {
    await expect(subject.execute(input)).resolves.toEqual({
      occupancy,
      revenue,
      reservations,
    });
    expect(occupancyExecute).toHaveBeenCalledWith(input);
    expect(revenueExecute).toHaveBeenCalledWith(input);
    expect(reservationsExecute).toHaveBeenCalledWith(input);
  });

  it('preserves valid empty metrics and a null occupancy rate', async () => {
    occupancyExecute.mockResolvedValueOnce({
      occupiedResourceNights: 0,
      sellableResourceNights: 0,
      occupancyRateBasisPoints: null,
    });
    revenueExecute.mockResolvedValueOnce({ currency: 'PYG', amountMinor: 0 });
    reservationsExecute.mockResolvedValueOnce({
      total: 0,
      byStatus: Object.fromEntries(
        Object.values(BookingStatus).map((status) => [status, 0]),
      ),
    });

    await expect(subject.execute(input)).resolves.toMatchObject({
      occupancy: { occupancyRateBasisPoints: null },
      revenue: { currency: 'PYG', amountMinor: 0 },
      reservations: { total: 0 },
    });
  });

  it.each(failingExecutions)('fails all-or-nothing when %s fails', async (_name, execute) => {
    const error = new OccupancyKpiInvariantError('projection failed');
    execute.mockRejectedValueOnce(error);
    await expect(subject.execute(input)).rejects.toBe(error);
  });
});
