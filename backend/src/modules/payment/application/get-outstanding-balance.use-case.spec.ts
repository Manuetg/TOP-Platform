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
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T02:30:00.000Z'));
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
      creditAmountMinor: 0,
      needsReconciliation: false,
      warning: null,
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

  it('uses the current total instead of the original Snapshot and preserves PYG', async () => {
    calculate.mockResolvedValueOnce(projection({
      currentCurrency: 'PYG',
      currentTotalAmountMinor: 80,
      currentPricingRevisionId: 'revision-1',
      paidAmountMinor: 40,
    }));
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      currency: 'PYG',
      totalAmountMinor: 80,
      paidAmountMinor: 40,
      outstandingAmountMinor: 40,
      creditAmountMinor: 0,
      needsReconciliation: false,
      warning: null,
    });
  });

  it('preserves an excess after a price reduction as credit without inventing a refund', async () => {
    calculate.mockResolvedValueOnce(projection({
      currentTotalAmountMinor: 80,
      paidAmountMinor: 100,
    }));
    const result = await subject.execute(businessId, bookingId);
    expect(result).toMatchObject({
      totalAmountMinor: 80,
      paidAmountMinor: 100,
      outstandingAmountMinor: 0,
      creditAmountMinor: 20,
      financialStatus: 'PAID',
      needsReconciliation: true,
      overdueAmountMinor: null,
      nextDueDate: null,
      nextDueAmountMinor: null,
    });
    expect(result.warning).toContain('conciliación');
  });

  it.each([
    { currentTotalAmountMinor: 80 },
    { currentTotalAmountMinor: 150 },
    { planCurrency: 'USD' },
    { paidAmountMinor: 50, appliedAmountMinor: 40 },
  ])('requires reconciliation for a stale plan or unapplied recorded money (%#)', async (changes) => {
    calculate.mockResolvedValueOnce(projection({
      currentTotalAmountMinor: 100,
      currentCurrency: 'PYG',
      paymentPlanId: 'plan',
      planCurrency: 'PYG',
      paidAmountMinor: 40,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 40,
      overdueAmountMinor: 20,
      nextDueDate: new Date('2026-09-01'),
      nextDueAmountMinor: 20,
      ...changes,
    }));
    const result = await subject.execute(businessId, bookingId);
    expect(result).toMatchObject({
      needsReconciliation: true,
      overdueAmountMinor: null,
      nextDueDate: null,
      nextDueAmountMinor: null,
    });
    expect(result.warning).toContain('conciliación');
  });

  it.each([
    { paid: 40, expected: false },
    { paid: 50, expected: true },
  ])('rechecks a restored price by actual plan totals and unapplied money, not revision (%#)', async ({ paid, expected }) => {
    calculate.mockResolvedValueOnce(projection({
      currentTotalAmountMinor: 100,
      currentPricingRevisionId: 'restored-price-revision',
      paymentPlanId: 'original-plan',
      planCurrency: 'PYG',
      paidAmountMinor: paid,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 40,
      overdueAmountMinor: 20,
      nextDueDate: new Date('2026-09-01'),
      nextDueAmountMinor: 20,
    }));
    const result = await subject.execute(businessId, bookingId);
    expect(result.needsReconciliation).toBe(expected);
    expect(result.overdueAmountMinor).toBe(expected ? null : 20);
    expect(result.warning === null).toBe(!expected);
  });

  it('does not expose stale due values when a plan currency differs', async () => {
    calculate.mockResolvedValueOnce(projection({
      paymentPlanId: 'plan',
      planCurrency: 'USD',
      paidAmountMinor: 40,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 40,
      overdueAmountMinor: 80,
      nextDueDate: new Date('2026-09-01'),
      nextDueAmountMinor: 80,
    }));
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      outstandingAmountMinor: 60,
      financialStatus: 'PARTIALLY_PAID',
      needsReconciliation: true,
      overdueAmountMinor: null,
      nextDueDate: null,
      nextDueAmountMinor: null,
    });
  });

  it('keeps exact safe integer amounts without percentage or floating point conversion', async () => {
    calculate.mockResolvedValueOnce(projection({
      currentTotalAmountMinor: Number.MAX_SAFE_INTEGER,
      paidAmountMinor: Number.MAX_SAFE_INTEGER - 1,
    }));
    await expect(subject.execute(businessId, bookingId)).resolves.toMatchObject({
      totalAmountMinor: Number.MAX_SAFE_INTEGER,
      paidAmountMinor: Number.MAX_SAFE_INTEGER - 1,
      outstandingAmountMinor: 1,
      creditAmountMinor: 0,
    });
  });

  it('uses the Business IANA timezone instead of the UTC calendar date', async () => {
    expect(
      localDateInTimeZone(
        new Date('2026-09-10T02:30:00.000Z'),
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
    BookingStatus.PENDING,
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
    projection({ paidAmountMinor: -1 }),
    projection({ paidAmountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    projection({ currentTotalAmountMinor: -1 }),
    projection({ currentTotalAmountMinor: Number.MAX_SAFE_INTEGER + 1 }),
    projection({ paidAmountMinor: 40, invalidMonetaryData: true }),
    projection({ currentTotalAmountMinor: 80, paidAmountMinor: 100, paymentCurrencyMismatch: true }),
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
      appliedAmountMinor: 41,
    }),
    projection({
      currentTotalAmountMinor: 80,
      paymentPlanId: 'plan',
      paidAmountMinor: 100,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 101,
    }),
    projection({ overdueAmountMinor: 1 }),
    projection({ nextDueAmountMinor: -1 }),
    projection({ nextDueDate: new Date('invalid') }),
  ])('rejects corrupted persisted financial state (%#)', async (value) => {
    calculate.mockResolvedValueOnce(value);
    await expect(subject.execute(businessId, bookingId)).rejects.toBeInstanceOf(
      OutstandingBalanceInvariantError,
    );
  });
});
