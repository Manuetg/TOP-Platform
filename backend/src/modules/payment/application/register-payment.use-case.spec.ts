import { createHash } from 'crypto';
import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import { Booking } from '../../booking/domain/booking.entity';
import { BookingStatus } from '../../booking/domain/booking-status.enum';
import { PaymentConflictError, PaymentInputError, PaymentNotFoundError, RegisterPaymentUseCase } from './register-payment.use-case';
import { PaymentMethod, PaymentStatus, type Payment, type PaymentRepository } from '../domain/payment';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const paidAt = '2026-09-01T12:00:00.000Z';
const booking = (status = BookingStatus.CONFIRMED) => Booking.create({ id: bookingId, businessId, status, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });
const business = (status = BusinessStatus.ACTIVE) => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
const payment = (overrides: Partial<Payment> = {}): Payment => ({ id: '44444444-4444-4444-8444-444444444444', businessId, bookingId, amountMinor: 40, currency: 'PYG', method: PaymentMethod.CASH, reference: 'Ref', note: 'Nota', paidAt: new Date(paidAt), recordedByUserId: actorUserId, status: PaymentStatus.RECORDED, idempotencyKey: 'key-1', requestFingerprint: createHash('sha256').update(JSON.stringify([bookingId, 40, PaymentMethod.CASH, paidAt, 'Ref', 'Nota'])).digest('hex'), createdAt: new Date(), ...overrides });

describe('RegisterPaymentUseCase', () => {
  const register = jest.fn<ReturnType<PaymentRepository['register']>, Parameters<PaymentRepository['register']>>();
  const findByIdempotencyKey = jest.fn<Promise<Payment | null>, [string, string]>();
  const findBooking = jest.fn();
  const findSnapshot = jest.fn();
  const findBusiness = jest.fn();
  const repository = { register, findByIdempotencyKey, listByBooking: jest.fn() };
  const subject = new RegisterPaymentUseCase(repository, { findByIdAndBusinessId: findBooking } as never, { findByBookingId: findSnapshot } as never, { findById: findBusiness } as never);
  const input = { businessId, bookingId, amountMinor: 40, method: PaymentMethod.CASH, paidAt, reference: ' Ref ', note: ' Nota ', idempotencyKey: ' key-1 ', actorUserId };

  beforeEach(() => {
    jest.resetAllMocks();
    findByIdempotencyKey.mockResolvedValue(null);
    findBusiness.mockResolvedValue(business());
    findBooking.mockResolvedValue(booking());
    findSnapshot.mockResolvedValue({ id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: new Date() });
    register.mockResolvedValue({ payment: payment(), duplicate: false });
  });

  it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED])('delegates %s registration to the atomic repository without mutating lookup objects', async (status) => {
    const originalBooking = booking(status);
    const snapshot = { id: 'snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: new Date() };
    findBooking.mockResolvedValueOnce(originalBooking);
    findSnapshot.mockResolvedValueOnce(snapshot);
    await expect(subject.execute(input)).resolves.toMatchObject({ status: PaymentStatus.RECORDED, currency: 'PYG', recordedByUserId: actorUserId });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ businessId, bookingId, currency: 'PYG', recordedByUserId: actorUserId, status: PaymentStatus.RECORDED, reference: 'Ref', note: 'Nota', idempotencyKey: 'key-1', requestFingerprint: payment().requestFingerprint }), 100);
    expect(originalBooking.status).toBe(status);
    expect(snapshot).toMatchObject({ currency: 'PYG', totalAmountMinor: 100 });
  });

  it('accepts the smallest positive payment without a percentage threshold', async () => {
    findBooking.mockResolvedValueOnce(booking(BookingStatus.PENDING));
    findSnapshot.mockResolvedValueOnce({ businessId, currency: 'PYG', totalAmountMinor: 1_000_000 });
    await subject.execute({ ...input, amountMinor: 1 });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1, status: PaymentStatus.RECORDED }), 1_000_000);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '40', null])('rejects invalid amount %p before lookups or writes', async (amountMinor) => {
    await expect(subject.execute({ ...input, amountMinor })).rejects.toBeInstanceOf(PaymentInputError);
    expect(findByIdempotencyKey).not.toHaveBeenCalled();
    expect(findBusiness).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it.each([BookingStatus.DRAFT, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])('rejects a new payment for %s', async (status) => {
    findBooking.mockResolvedValueOnce(booking(status));
    await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(findSnapshot).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects a new payment for an archived Business', async () => {
    findBusiness.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(register).not.toHaveBeenCalled();
  });

  it('hides missing Business and cross-tenant Booking before writing', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentNotFoundError);
    findBooking.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentNotFoundError);
    expect(findBooking).toHaveBeenCalledWith(bookingId, businessId);
    expect(register).not.toHaveBeenCalled();
  });

  it.each([null, { businessId: 'another-tenant', currency: 'PYG', totalAmountMinor: 100 }])('rejects a missing or cross-tenant snapshot %p', async (snapshot) => {
    findSnapshot.mockResolvedValueOnce(snapshot);
    await expect(subject.execute(input)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects future dates and missing keys before lookups', async () => {
    await expect(subject.execute({ ...input, paidAt: '2999-01-01T00:00:00.000Z' })).rejects.toBeInstanceOf(PaymentInputError);
    await expect(subject.execute({ ...input, idempotencyKey: '   ' })).rejects.toBeInstanceOf(PaymentInputError);
    expect(findByIdempotencyKey).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('accepts historical paidAt and exact text boundaries while rejecting overflow', async () => {
    await expect(subject.execute({ ...input, paidAt: '2020-01-01T00:00:00.000Z', reference: 'r'.repeat(120), note: 'n'.repeat(500) })).resolves.toBeDefined();
    await expect(subject.execute({ ...input, reference: 'r'.repeat(121) })).rejects.toBeInstanceOf(PaymentInputError);
    await expect(subject.execute({ ...input, note: 'n'.repeat(501) })).rejects.toBeInstanceOf(PaymentInputError);
  });

  it('propagates transactional overpayment and idempotency conflicts', async () => {
    register.mockRejectedValueOnce(new Error('OVERPAYMENT')).mockRejectedValueOnce(new Error('IDEMPOTENCY_CONFLICT'));
    await expect(subject.execute(input)).rejects.toThrow('OVERPAYMENT');
    await expect(subject.execute({ ...input, amountMinor: 41 })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });

  it.each([BookingStatus.CANCELLED, BookingStatus.NO_SHOW, BookingStatus.COMPLETED])('returns a committed retry before consulting a now %s booking or archived Business', async (status) => {
    const original = payment();
    findByIdempotencyKey.mockResolvedValueOnce(original);
    findBusiness.mockResolvedValueOnce(business(BusinessStatus.ARCHIVED));
    findBooking.mockResolvedValueOnce(booking(status));
    await expect(subject.execute(input)).resolves.toBe(original);
    expect(findByIdempotencyKey).toHaveBeenCalledWith(businessId, 'key-1');
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findBooking).not.toHaveBeenCalled();
    expect(findSnapshot).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it.each([{ amountMinor: 41 }, { bookingId: '55555555-5555-4555-8555-555555555555' }, { method: PaymentMethod.CARD }, { note: 'Changed' }])('rejects a changed payload on the original key before state checks: %p', async (change) => {
    findByIdempotencyKey.mockResolvedValueOnce(payment());
    await expect(subject.execute({ ...input, ...change })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(findBusiness).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('returns the original row when a concurrent request wins the repository race', async () => {
    const original = payment();
    register.mockResolvedValueOnce({ payment: original, duplicate: true });
    await expect(subject.execute(input)).resolves.toBe(original);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('keeps compatibility with repository test doubles without the optional retry lookup', async () => {
    const legacySubject = new RegisterPaymentUseCase({ register, listByBooking: jest.fn() }, { findByIdAndBusinessId: findBooking } as never, { findByBookingId: findSnapshot } as never, { findById: findBusiness } as never);
    await expect(legacySubject.execute(input)).resolves.toMatchObject({ status: PaymentStatus.RECORDED });
    expect(register).toHaveBeenCalledTimes(1);
  });
});
