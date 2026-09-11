import { Logger } from '@nestjs/common';
import {
  BookingStatus,
  type ReservationsProjectionReader,
} from '../../booking/booking.contract';
import { BusinessStatus } from '../../business/business.contract';
import { Business } from '../../business/domain/business.entity';
import type { BusinessRepository } from '../../business/domain/business.repository';
import {
  GetReservationsKpiUseCase,
  ReservationsKpiInputError,
  ReservationsKpiInvariantError,
  ReservationsKpiNotFoundError,
} from './get-reservations-kpi.use-case';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';

function business(status = BusinessStatus.ACTIVE): Business {
  return Business.create({
    id: businessId,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

const emptyByStatus = {
  DRAFT: 0,
  PENDING: 0,
  CONFIRMED: 0,
  IN_PROGRESS: 0,
  COMPLETED: 0,
  CANCELLED: 0,
  NO_SHOW: 0,
};

describe('GetReservationsKpiUseCase', () => {
  const findById = jest.fn<
    ReturnType<BusinessRepository['findById']>,
    Parameters<BusinessRepository['findById']>
  >();
  const read = jest.fn<
    ReturnType<ReservationsProjectionReader['read']>,
    Parameters<ReservationsProjectionReader['read']>
  >();
  const subject = new GetReservationsKpiUseCase(
    {
      create: jest.fn(),
      findById,
      list: jest.fn(),
      update: jest.fn(),
    },
    { read },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findById.mockResolvedValue(business());
    read.mockResolvedValue([]);
  });

  it('returns all statuses as zero for an empty period and delegates timezone', async () => {
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).resolves.toEqual({ total: 0, byStatus: emptyByStatus });
    expect(read).toHaveBeenCalledWith({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
      timeZone: 'America/Asuncion',
    });
  });

  it('maps every current status and derives the exact total', async () => {
    read.mockResolvedValueOnce([
      { status: BookingStatus.DRAFT, count: 1 },
      { status: BookingStatus.PENDING, count: 2 },
      { status: BookingStatus.CONFIRMED, count: 3 },
      { status: BookingStatus.IN_PROGRESS, count: 4 },
      { status: BookingStatus.COMPLETED, count: 5 },
      { status: BookingStatus.CANCELLED, count: 6 },
      { status: BookingStatus.NO_SHOW, count: 7 },
    ]);
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-10',
    })).resolves.toEqual({
      total: 28,
      byStatus: {
        DRAFT: 1,
        PENDING: 2,
        CONFIRMED: 3,
        IN_PROGRESS: 4,
        COMPLETED: 5,
        CANCELLED: 6,
        NO_SHOW: 7,
      },
    });
  });

  it('accepts exactly 31 days, future dates and archived Businesses', async () => {
    findById.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    await expect(subject.execute({
      businessId,
      from: '2099-01-01',
      to: '2099-02-01',
    })).resolves.toEqual({ total: 0, byStatus: emptyByStatus });
  });

  it.each([
    ['2026/09/01', '2026-09-02'],
    ['2026-02-30', '2026-03-02'],
    ['2026-09-02', '2026-09-02'],
    ['2026-09-03', '2026-09-02'],
    ['2026-01-01', '2026-02-02'],
  ])('rejects invalid period %s..%s', async (from, to) => {
    await expect(subject.execute({ businessId, from, to }))
      .rejects.toBeInstanceOf(ReservationsKpiInputError);
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects an invalid Business identifier before lookup', async () => {
    await expect(subject.execute({
      businessId: 'invalid',
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(ReservationsKpiInputError);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a missing Business before reading the projection', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(ReservationsKpiNotFoundError);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'UNKNOWN' as BookingStatus, count: 1 }],
    [{ status: BookingStatus.DRAFT, count: -1 }],
    [{ status: BookingStatus.DRAFT, count: 1.5 }],
    [{ status: BookingStatus.DRAFT, count: Number.MAX_SAFE_INTEGER + 1 }],
    [
      { status: BookingStatus.DRAFT, count: 1 },
      { status: BookingStatus.DRAFT, count: 2 },
    ],
  ])('rejects invalid projection %#', async (...rows) => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    read.mockResolvedValueOnce(rows);
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(ReservationsKpiInvariantError);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      event: 'reservations_kpi_invariant_violation',
      businessId,
    }));
    log.mockRestore();
  });

  it('rejects a total that exceeds the safe integer range', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    read.mockResolvedValueOnce([
      { status: BookingStatus.DRAFT, count: Number.MAX_SAFE_INTEGER },
      { status: BookingStatus.PENDING, count: 1 },
    ]);
    await expect(subject.execute({
      businessId,
      from: '2026-09-01',
      to: '2026-09-02',
    })).rejects.toBeInstanceOf(ReservationsKpiInvariantError);
    log.mockRestore();
  });
});
