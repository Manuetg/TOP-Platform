import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { Booking } from '../../booking/domain/booking.entity';
import { BookingStatus } from '../../booking/domain/booking-status.enum';
import { PaymentConflictError, PaymentInputError, RegisterPaymentUseCase } from './register-payment.use-case';
import { PaymentMethod, PaymentStatus, type Payment, type PaymentRepository } from '../domain/payment';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const paidAt = '2026-09-01T12:00:00.000Z';
const booking = (status = BookingStatus.CONFIRMED) => Booking.create({ id: bookingId, businessId, status, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });
const business = () => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
const payment = (overrides: Partial<Payment> = {}): Payment => ({ id: '44444444-4444-4444-8444-444444444444', businessId, bookingId, amountMinor: 40, currency: 'PYG', method: PaymentMethod.CASH, reference: null, note: null, paidAt: new Date(paidAt), recordedByUserId: actorUserId, status: PaymentStatus.RECORDED, idempotencyKey: 'key-1', requestFingerprint: 'fingerprint', createdAt: new Date(), ...overrides });

describe('RegisterPaymentUseCase', () => {
  const register = jest.fn<ReturnType<PaymentRepository['register']>, Parameters<PaymentRepository['register']>>();
  const findBooking = jest.fn(); const findSnapshot = jest.fn(); const findBusiness = jest.fn();
  const subject = new RegisterPaymentUseCase({ register }, { findByIdAndBusinessId: findBooking } as never, { findByBookingId: findSnapshot } as never, { findById: findBusiness } as never);
  const input = { businessId, bookingId, amountMinor: 40, method: PaymentMethod.CASH, paidAt, reference: ' Ref ', note: ' Nota ', idempotencyKey: ' key-1 ', actorUserId };

  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue(business()); findBooking.mockResolvedValue(booking()); findSnapshot.mockResolvedValue({ id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: new Date() }); register.mockResolvedValue({ payment: payment(), duplicate: false }); });

  it.each([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED])('registers %s without modifying booking or snapshot', async (status) => {
    const originalBooking = booking(status); const snapshot = { id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: new Date() };
    findBooking.mockResolvedValueOnce(originalBooking); findSnapshot.mockResolvedValueOnce(snapshot);
    await expect(subject.execute(input)).resolves.toMatchObject({ status: PaymentStatus.RECORDED, currency: 'PYG', recordedByUserId: actorUserId });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ currency: 'PYG', recordedByUserId: actorUserId, status: PaymentStatus.RECORDED, reference: 'Ref', note: 'Nota', idempotencyKey: 'key-1' }), 100);
    expect(originalBooking.status).toBe(status); expect(snapshot).toEqual(expect.objectContaining({ currency: 'PYG', totalAmountMinor: 100 }));
  });

  it.each([0, -1, 1.5])('rejects invalid amount %p before lookups', async (amountMinor) => { await expect(subject.execute({ ...input, amountMinor })).rejects.toBeInstanceOf(PaymentInputError); expect(findBusiness).not.toHaveBeenCalled(); });
  it.each([BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])('rejects %s bookings', async (status) => { findBooking.mockResolvedValueOnce(booking(status)); await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentConflictError); expect(findSnapshot).not.toHaveBeenCalled(); });
  it('rejects missing snapshot and future paidAt', async () => { findSnapshot.mockResolvedValueOnce(null); await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentConflictError); await expect(subject.execute({ ...input, paidAt: '2999-01-01T00:00:00.000Z' })).rejects.toBeInstanceOf(PaymentInputError); });
  it('accepts historical paidAt and exact text boundaries while rejecting overflow', async () => { await expect(subject.execute({ ...input, paidAt: '2020-01-01T00:00:00.000Z', reference: 'r'.repeat(120), note: 'n'.repeat(500) })).resolves.toBeDefined(); await expect(subject.execute({ ...input, reference: 'r'.repeat(121) })).rejects.toBeInstanceOf(PaymentInputError); await expect(subject.execute({ ...input, note: 'n'.repeat(501) })).rejects.toBeInstanceOf(PaymentInputError); });
  it('propagates overpayment and idempotency conflicts from the atomic repository', async () => { register.mockRejectedValueOnce(new Error('OVERPAYMENT')).mockRejectedValueOnce(new Error('IDEMPOTENCY_CONFLICT')); await expect(subject.execute(input)).rejects.toThrow('OVERPAYMENT'); await expect(subject.execute({ ...input, amountMinor: 41 })).rejects.toThrow('IDEMPOTENCY_CONFLICT'); });
  it('returns the original payment for an identical idempotent retry without another create', async () => { const existing = payment(); register.mockResolvedValueOnce({ payment: existing, duplicate: true }); await expect(subject.execute(input)).resolves.toBe(existing); expect(register).toHaveBeenCalledTimes(1); });
});
