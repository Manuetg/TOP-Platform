import { Booking } from '../../booking/domain/booking.entity';
import { BookingStatus } from '../../booking/domain/booking-status.enum';
import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import type { PaymentPlan, PaymentPlanRepository } from '../domain/payment-plan';
import { PaymentPlanConflictError, PaymentPlanInputError, PaymentPlanUseCases } from './payment-plan.use-cases';

const businessId = '11111111-1111-4111-8111-111111111111'; const bookingId = '22222222-2222-4222-8222-222222222222'; const actorUserId = '33333333-3333-4333-8333-333333333333';
const business = (status = BusinessStatus.ACTIVE) => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
const booking = (status = BookingStatus.CONFIRMED) => Booking.create({ id: bookingId, businessId, status, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });
const plan = (installments: PaymentPlan['installments'] = [{ id: 'i1', amountMinor: 40, dueDate: null, sortOrder: 0, appliedAmountMinor: 0 }, { id: 'i2', amountMinor: 60, dueDate: null, sortOrder: 1, appliedAmountMinor: 0 }]): PaymentPlan => ({ id: 'plan', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, createdByUserId: actorUserId, updatedByUserId: actorUserId, createdAt: new Date(), updatedAt: new Date(), installments });

describe('PaymentPlanUseCases', () => {
  const create = jest.fn<ReturnType<PaymentPlanRepository['create']>, Parameters<PaymentPlanRepository['create']>>(); const findByBooking = jest.fn(); const replace = jest.fn(); const findBusiness = jest.fn(); const findBooking = jest.fn(); const findSnapshot = jest.fn();
  const subject = new PaymentPlanUseCases({ create, findByBooking, replace }, { findByIdAndBusinessId: findBooking } as never, { findByBookingId: findSnapshot } as never, { findById: findBusiness } as never);
  const input = { businessId, bookingId, actorUserId, installments: [{ amountMinor: 40, dueDate: '2026-10-01' }, { amountMinor: 60, dueDate: null }] };
  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue(business()); findBooking.mockResolvedValue(booking()); findSnapshot.mockResolvedValue({ id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: new Date() }); create.mockResolvedValue(plan()); replace.mockResolvedValue(plan()); findByBooking.mockResolvedValue(plan()); });

  it.each([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS])('creates a plan for %s deriving total, currency, actor and sortOrder', async (status) => { findBooking.mockResolvedValueOnce(booking(status)); await subject.create(input); expect(create).toHaveBeenCalledWith({ businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, actorUserId, installments: [{ amountMinor: 40, dueDate: new Date('2026-10-01T00:00:00.000Z'), sortOrder: 0 }, { amountMinor: 60, dueDate: null, sortOrder: 1 }] }); });
  it.each([
    { installments: [] },
    { installments: Array.from({ length: 101 }, () => ({ amountMinor: 1 })) },
  ])('rejects installment count boundaries', async ({ installments }) => { await expect(subject.create({ ...input, installments })).rejects.toBeInstanceOf(PaymentPlanInputError); expect(findBusiness).not.toHaveBeenCalled(); });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid installment amount %p', async (amountMinor) => { await expect(subject.create({ ...input, installments: [{ amountMinor }] })).rejects.toBeInstanceOf(PaymentPlanInputError); });
  it.each(['2026-02-30', '2026-1-01', 'invalid'])('rejects invalid pure date %s', async (dueDate) => { await expect(subject.create({ ...input, installments: [{ amountMinor: 100, dueDate }] })).rejects.toBeInstanceOf(PaymentPlanInputError); });
  it.each([BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])('rejects writes for %s', async (status) => { findBooking.mockResolvedValueOnce(booking(status)); await expect(subject.create(input)).rejects.toBeInstanceOf(PaymentPlanConflictError); expect(create).not.toHaveBeenCalled(); });
  it('rejects missing snapshot and total mismatch', async () => { findSnapshot.mockResolvedValueOnce(null); await expect(subject.create(input)).rejects.toBeInstanceOf(PaymentPlanConflictError); findSnapshot.mockResolvedValueOnce({ id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 101, items: [], createdAt: new Date() }); await expect(subject.create(input)).rejects.toThrow('total del plan'); });
  it('replaces before applications and maps repository conflicts', async () => { await expect(subject.replace(input)).resolves.toMatchObject({ bookingId, totalAmountMinor: 100 }); replace.mockRejectedValueOnce(new Error('PAYMENT_PLAN_HAS_APPLICATIONS')); await expect(subject.replace(input)).rejects.toBeInstanceOf(PaymentPlanConflictError); });
  it('derives PAID, OVERDUE, PARTIALLY_PAID and PENDING using approved precedence', async () => { findByBooking.mockResolvedValueOnce(plan([{ id: 'paid', amountMinor: 10, dueDate: new Date('2020-01-01'), sortOrder: 0, appliedAmountMinor: 10 }, { id: 'overdue', amountMinor: 10, dueDate: new Date('2020-01-01'), sortOrder: 1, appliedAmountMinor: 5 }, { id: 'partial', amountMinor: 10, dueDate: null, sortOrder: 2, appliedAmountMinor: 5 }, { id: 'pending', amountMinor: 70, dueDate: null, sortOrder: 3, appliedAmountMinor: 0 }])); const result = await subject.get(businessId, bookingId); expect(result.installments.map((item) => item.status)).toEqual(['PAID', 'OVERDUE', 'PARTIALLY_PAID', 'PENDING']); expect(result.installments.map((item) => item.outstandingAmountMinor)).toEqual([0, 5, 5, 70]); });
});
