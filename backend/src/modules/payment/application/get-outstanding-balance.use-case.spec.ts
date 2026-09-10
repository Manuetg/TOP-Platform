import { Booking } from '../../booking/domain/booking.entity';
import { BookingStatus } from '../../booking/domain/booking-status.enum';
import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import type {
  OutstandingBalanceProjection,
  OutstandingBalanceRepository,
} from '../domain/outstanding-balance';
import {
  GetOutstandingBalanceUseCase,
  OutstandingBalanceConflictError,
  OutstandingBalanceInvariantError,
  localDateInTimeZone,
} from './get-outstanding-balance.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';

const business = (timezone = 'America/Asuncion') =>
  Business.create({
    id: businessId,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone,
    currency: 'PYG',
    status: BusinessStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const booking = (status = BookingStatus.CONFIRMED) =>
  Booking.create({
    id: bookingId,
    businessId,
    status,
    contactId: null,
    resourceIds: [],
    checkInDate: null,
    checkOutDate: null,
    adults: null,
    children: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const projection = (
  changes: Partial<OutstandingBalanceProjection> = {},
): OutstandingBalanceProjection => ({
  paymentPlanId: null,
  paidAmountMinor: 0,
  planTotalAmountMinor: null,
  installmentTotalAmountMinor: 0,
  appliedAmountMinor: 0,
  overdueAmountMinor: 0,
  nextDueDate: null,
  nextDueAmountMinor: null,
  ...changes,
});

describe('GetOutstandingBalanceUseCase', () => {
  const calculate = jest.fn<
    ReturnType<OutstandingBalanceRepository['calculate']>,
    Parameters<OutstandingBalanceRepository['calculate']>
  >();
  const findBusiness = jest.fn();
  const findBooking = jest.fn();
  const findSnapshot = jest.fn();
  const subject = new GetOutstandingBalanceUseCase(
    { calculate },
    { findByIdAndBusinessId: findBooking } as never,
    { findByBookingId: findSnapshot } as never,
    { findById: findBusiness } as never,
  );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T03:30:00.000Z'));
    jest.resetAllMocks();
    findBusiness.mockResolvedValue(business());
    findBooking.mockResolvedValue(booking());
    findSnapshot.mockResolvedValue({
      id: 'snapshot',
      businessId,
      bookingId,
      currency: 'PYG',
      totalAmountMinor: 100,
      items: [],
      createdAt: new Date(),
    });
    calculate.mockResolvedValue(projection());
  });

  afterEach(() => jest.useRealTimers());

  it('returns UNPAID without Payments or a PaymentPlan', async () => {
    await expect(subject.execute(businessId, bookingId)).resolves.toEqual({
      bookingId,
      currency: 'PYG',
      totalAmountMinor: 100,
      paidAmountMinor: 0,
      outstandingAmountMinor: 100,
      overdueAmountMinor: 0,
      financialStatus: 'UNPAID',
      nextDueDate: null,
      nextDueAmountMinor: null,
    });
  });

  it.each([
    { paid: 40, expected: 'PARTIALLY_PAID' },
    { paid: 100, expected: 'PAID' },
  ])('derives $expected from paid amount $paid', async ({ paid, expected }) => {
    calculate.mockResolvedValueOnce(projection({ paidAmountMinor: paid }));
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      paidAmountMinor: paid,
      outstandingAmountMinor: 100 - paid,
      financialStatus: expected,
    });
  });

  it('derives overdue and next due from installment applications', async () => {
    calculate.mockResolvedValueOnce(
      projection({
        paymentPlanId: 'plan',
        paidAmountMinor: 40,
        planTotalAmountMinor: 100,
        installmentTotalAmountMinor: 100,
        appliedAmountMinor: 40,
        overdueAmountMinor: 20,
        nextDueDate: new Date('2026-09-01T00:00:00.000Z'),
        nextDueAmountMinor: 20,
      }),
    );
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      overdueAmountMinor: 20,
      nextDueDate: '2026-09-01',
      nextDueAmountMinor: 20,
      financialStatus: 'OVERDUE',
    });
  });

  it('gives PAID precedence over stale overdue information', async () => {
    calculate.mockResolvedValueOnce(
      projection({ paidAmountMinor: 100, overdueAmountMinor: 1 }),
    );
    await expect(subject.execute(businessId, bookingId)).rejects.toBeInstanceOf(
      OutstandingBalanceInvariantError,
    );
  });

  it('gives OVERDUE precedence over PARTIALLY_PAID', async () => {
    calculate.mockResolvedValueOnce(
      projection({
        paymentPlanId: 'plan',
        paidAmountMinor: 10,
        planTotalAmountMinor: 100,
        installmentTotalAmountMinor: 100,
        appliedAmountMinor: 10,
        overdueAmountMinor: 30,
        nextDueDate: new Date('2026-09-01'),
        nextDueAmountMinor: 30,
      }),
    );
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      financialStatus: 'OVERDUE',
    });
  });

  it('uses the Business IANA timezone instead of the UTC calendar date', async () => {
    expect(
      localDateInTimeZone(
        new Date('2026-09-10T03:30:00.000Z'),
        'America/Asuncion',
      ),
    ).toBe('2026-09-09');
    await subject.execute(businessId, bookingId);
    expect(calculate).toHaveBeenCalledWith({
      businessId,
      bookingId,
      businessLocalDate: '2026-09-09',
    });
  });

  it.each([
    BookingStatus.CONFIRMED,
    BookingStatus.IN_PROGRESS,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('does not block historical read for %s when a snapshot exists', async (status) => {
    findBooking.mockResolvedValueOnce(booking(status));
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      bookingId,
    });
  });

  it('allows archived Business historical reads', async () => {
    const archived = business();
    findBusiness.mockResolvedValueOnce(archived.archive());
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      bookingId,
    });
  });

  it('rejects a missing PricingSnapshot with a conflict', async () => {
    findSnapshot.mockResolvedValueOnce(null);
    await expect(subject.execute(businessId, bookingId)).rejects.toBeInstanceOf(
      OutstandingBalanceConflictError,
    );
    expect(calculate).not.toHaveBeenCalled();
  });

  it.each([
    projection({ paidAmountMinor: 101 }),
    projection({
      paymentPlanId: 'plan',
      paidAmountMinor: 40,
      planTotalAmountMinor: 99,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 40,
    }),
    projection({
      paymentPlanId: 'plan',
      paidAmountMinor: 40,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 39,
    }),
    projection({ overdueAmountMinor: 1 }),
  ])('rejects impossible persisted financial state', async (value) => {
    calculate.mockResolvedValueOnce(value);
    await expect(subject.execute(businessId, bookingId)).rejects.toBeInstanceOf(
      OutstandingBalanceInvariantError,
    );
  });
});
