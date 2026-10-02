import { Prisma } from '@prisma/client';
import { validateAvailabilityInTransaction } from '../../availability/availability.contract';
import { AvailabilityBusinessUnavailableError } from '../../availability/application/availability.errors';
import { PaymentConflictError, PaymentNotFoundError } from '../application/register-payment.use-case';
import { PaymentMethod, PaymentStatus, type RegisterPaymentData } from '../domain/payment';
import { PrismaPaymentRepository } from './prisma-payment.repository';

jest.mock('../../availability/availability.contract', () => ({
  ...jest.requireActual<typeof import('../../availability/availability.contract')>('../../availability/availability.contract'),
  validateAvailabilityInTransaction: jest.fn(),
}));

const data = (overrides: Partial<RegisterPaymentData> = {}): RegisterPaymentData => ({ businessId: '11111111-1111-4111-8111-111111111111', bookingId: '22222222-2222-4222-8222-222222222222', amountMinor: 40, currency: 'PYG', method: PaymentMethod.CASH, reference: null, note: null, paidAt: new Date('2026-09-01T12:00:00Z'), recordedByUserId: '33333333-3333-4333-8333-333333333333', status: PaymentStatus.RECORDED, idempotencyKey: 'key-1', requestFingerprint: 'fingerprint-1', ...overrides });
const resourceId = '44444444-4444-4444-8444-444444444444';
const currentBooking = (status = 'CONFIRMED') => ({ id: data().bookingId, businessId: data().businessId, status, contactId: '55555555-5555-4555-8555-555555555555', checkInDate: new Date('2026-09-10'), checkOutDate: new Date('2026-09-12'), adults: 1, children: 0, resources: [{ resourceId }] });

describe('PrismaPaymentRepository', () => {
  const queryRaw = jest.fn<Promise<Array<{ id: string }>>, [Prisma.Sql]>();
  const executeRaw = jest.fn<Promise<number>, [Prisma.Sql]>();
  const findUnique = jest.fn();
  const aggregate = jest.fn();
  const create = jest.fn();
  const findMany = jest.fn();
  const findPlan = jest.fn();
  const findBooking = jest.fn();
  const updateBooking = jest.fn();
  const findBusiness = jest.fn();
  const findSnapshot = jest.fn();
  const findContact = jest.fn();
  const findResource = jest.fn();
  const timelineCreate = jest.fn();
  const retryLookup = jest.fn();
  const validateAvailability = jest.mocked(validateAvailabilityInTransaction);
  const transaction = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    booking: { findFirst: findBooking, updateMany: updateBooking },
    business: { findUnique: findBusiness },
    pricingSnapshot: { findUnique: findSnapshot },
    contact: { findFirst: findContact },
    resource: { findFirst: findResource },
    bookingTimelineEvent: { create: timelineCreate },
    payment: { findUnique, aggregate, create },
    paymentPlan: { findUnique: findPlan },
    paymentApplication: { aggregate: jest.fn(), createMany: jest.fn() },
    paymentPlanInstallment: { findMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)), payment: { findMany, findUnique: retryLookup } };
  const subject = new PrismaPaymentRepository(prisma as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback: (tx: typeof transaction) => unknown) => callback(transaction));
    queryRaw.mockResolvedValue([{ id: data().bookingId }]);
    executeRaw.mockResolvedValue(1);
    findUnique.mockResolvedValue(null);
    retryLookup.mockResolvedValue(null);
    findBooking.mockResolvedValue(currentBooking());
    findBusiness.mockResolvedValue({ id: data().businessId, status: 'ACTIVE' });
    findSnapshot.mockResolvedValue({ businessId: data().businessId, bookingId: data().bookingId, currency: 'PYG', totalAmountMinor: 100n });
    findContact.mockResolvedValue({ id: currentBooking().contactId });
    findResource.mockResolvedValue({ capacityMaximum: 4, capacityMaximumChildren: 2 });
    findPlan.mockResolvedValue(null);
    aggregate.mockResolvedValue({ _sum: { amountMinor: null } });
    create.mockImplementation(({ data: value }: { data: RegisterPaymentData }) => Promise.resolve({ id: 'payment-id', ...value, createdAt: new Date() }));
    updateBooking.mockResolvedValue({ count: 1 });
    timelineCreate.mockResolvedValue({ id: 'timeline-id' });
    validateAvailability.mockResolvedValue({ valid: true, conflicts: [] });
  });

  it('locks and rereads the scoped booking and canonical snapshot inside the transaction', async () => {
    const value = data();
    const result = await subject.register(value, 100);
    expect(result).toMatchObject({ duplicate: false, payment: { businessId: value.businessId, bookingId: value.bookingId, amountMinor: 40, currency: 'PYG', recordedByUserId: value.recordedByUserId, status: PaymentStatus.RECORDED } });
    const bookingLock = queryRaw.mock.calls.find(([query]) => query.sql?.includes('Booking'));
    expect(bookingLock?.[0].sql).toContain('FOR UPDATE');
    expect(bookingLock?.[0].values).toEqual(expect.arrayContaining([value.bookingId, value.businessId]));
    const snapshotLock = queryRaw.mock.calls.find(([query]) => query.sql.includes('PricingSnapshot'));
    expect(snapshotLock?.[0].sql).toContain('FOR UPDATE');
    expect(snapshotLock?.[0].values).toEqual(expect.arrayContaining([value.bookingId, value.businessId]));
    expect(findBooking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: value.bookingId, businessId: value.businessId } }));
    expect(findSnapshot).toHaveBeenCalledWith(expect.objectContaining({ where: { bookingId: value.bookingId } }));
    expect(aggregate).toHaveBeenCalledWith({ where: { businessId: value.businessId, bookingId: value.bookingId, status: 'RECORDED' }, _sum: { amountMinor: true } });
    expect(create).toHaveBeenCalledWith({ data: { ...value, amountMinor: BigInt(value.amountMinor) } });
    expect(updateBooking).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe or nonpositive repository input %p before opening a transaction', async (amountMinor) => {
    await expect(subject.register(data({ amountMinor }), 100)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('serializes the tenant idempotency key before querying it or locking a Booking', async () => {
    await subject.register(data(), 100);
    expect(executeRaw.mock.calls[0][0].values).toContain(data().businessId + ':payment:' + data().idempotencyKey);
    expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(findUnique.mock.invocationCallOrder[0]);
    expect(findUnique.mock.invocationCallOrder[0]).toBeLessThan(queryRaw.mock.invocationCallOrder[0]);
  });

  it('confirms Pending for a one-unit payment and records one actor-linked financial cause', async () => {
    findBooking.mockResolvedValueOnce(currentBooking('PENDING'));
    await subject.register(data({ amountMinor: 1 }), 100);
    expect(validateAvailability).toHaveBeenCalledWith(transaction, expect.objectContaining({ businessId: data().businessId, resourceIds: [resourceId], excludeBookingId: data().bookingId }));
    expect(executeRaw.mock.calls.some(([query]) => query.values.includes(resourceId))).toBe(true);
    expect(updateBooking).toHaveBeenCalledWith({ where: { id: data().bookingId, businessId: data().businessId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    expect(timelineCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreate).toHaveBeenCalledWith({ data: { businessId: data().businessId, bookingId: data().bookingId, type: 'BOOKING_CONFIRMED', actorUserId: data().recordedByUserId, details: { paymentId: 'payment-id' } } });
  });

  it.each(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'])('records a new payment without regressing %s or creating confirmation history', async (status) => {
    findBooking.mockResolvedValueOnce(currentBooking(status));
    await expect(subject.register(data(), 100)).resolves.toMatchObject({ duplicate: false });
    expect(validateAvailability).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'CANCELLED', 'NO_SHOW'])('rejects a newly observed %s state before financial writes', async (status) => {
    findBooking.mockResolvedValueOnce(currentBooking(status));
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('rejects an archived Business observed inside the transaction', async () => {
    findBusiness.mockResolvedValueOnce({ id: data().businessId, status: 'ARCHIVED' });
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it('hides a missing or cross-tenant booking before financial writes', async () => {
    findBooking.mockResolvedValueOnce(null);
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentNotFoundError);
    expect(findBooking).toHaveBeenCalledWith(expect.objectContaining({ where: { id: data().bookingId, businessId: data().businessId } }));
    expect(create).not.toHaveBeenCalled();
  });

  it.each([null, { businessId: 'another-tenant', currency: 'PYG', totalAmountMinor: 100n }])('rejects a missing or cross-tenant canonical snapshot %p', async (snapshot) => {
    findSnapshot.mockResolvedValueOnce(snapshot);
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it('enforces the canonical snapshot total even when the caller read a stale larger total', async () => {
    findSnapshot.mockResolvedValueOnce({ businessId: data().businessId, currency: 'PYG', totalAmountMinor: 30n });
    await expect(subject.register(data(), 1_000)).rejects.toThrow('OVERPAYMENT');
    expect(create).not.toHaveBeenCalled();
  });

  it('sums already recorded payments inside the transaction before preventing overpayment', async () => {
    aggregate.mockResolvedValueOnce({ _sum: { amountMinor: 60n } });
    await expect(subject.register(data({ amountMinor: 50 }), 100)).rejects.toThrow('OVERPAYMENT');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a currency mismatch against the current canonical snapshot', async () => {
    findSnapshot.mockResolvedValueOnce({ businessId: data().businessId, currency: 'USD', totalAmountMinor: 100n });
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([{ contactId: null }, { checkInDate: null }, { checkOutDate: null }, { resources: [] }])('rejects an incomplete Pending booking before payment creation: %p', async (missing) => {
    findBooking.mockResolvedValueOnce({ ...currentBooking('PENDING'), ...missing });
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
  });

  it('does not persist or confirm when transactional availability detects a conflict', async () => {
    findBooking.mockResolvedValueOnce(currentBooking('PENDING'));
    validateAvailability.mockResolvedValueOnce({ valid: false, conflicts: [{ resourceId, reasons: ['BOOKING_CONFLICT'] }] });
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('rejects Pending when the contact is no longer present in its tenant', async () => {
    findBooking.mockResolvedValueOnce(currentBooking('PENDING'));
    findContact.mockResolvedValueOnce(null);
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(findContact).toHaveBeenCalledWith({ where: { id: currentBooking().contactId, businessId: data().businessId }, select: { id: true } });
    expect(create).not.toHaveBeenCalled();
  });

  it('maps a transactional inactive Business error to a Payment conflict without writing', async () => {
    findBooking.mockResolvedValueOnce(currentBooking('PENDING'));
    validateAvailability.mockRejectedValueOnce(new AvailabilityBusinessUnavailableError('Business inactive'));
    await expect(subject.register(data(), 100)).rejects.toBeInstanceOf(PaymentConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects the transaction if the conditional Pending transition no longer succeeds', async () => {
    findBooking.mockResolvedValueOnce(currentBooking('PENDING'));
    updateBooking.mockResolvedValueOnce({ count: 0 });
    await expect(subject.register(data(), 100)).rejects.toThrow();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('propagates a timeline failure so the real transaction can roll back all financial writes', async () => {
    findBooking.mockResolvedValueOnce(currentBooking('PENDING'));
    timelineCreate.mockRejectedValueOnce(new Error('forced timeline failure'));
    await expect(subject.register(data(), 100)).rejects.toThrow('forced timeline failure');
  });

  it('returns a committed duplicate before rereading new state or Business restrictions', async () => {
    const previous = { id: 'existing', ...data(), amountMinor: 40n, createdAt: new Date() };
    findUnique.mockResolvedValueOnce(previous);
    findBooking.mockResolvedValueOnce(currentBooking('CANCELLED'));
    findBusiness.mockResolvedValueOnce({ status: 'ARCHIVED' });
    await expect(subject.register(data(), 100)).resolves.toMatchObject({ duplicate: true, payment: { id: previous.id, amountMinor: 40 } });
    expect(findBooking).not.toHaveBeenCalled();
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findSnapshot).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });

  it('rejects a changed fingerprint on an existing tenant key without another write', async () => {
    findUnique.mockResolvedValueOnce({ id: 'existing', ...data(), amountMinor: 40n, requestFingerprint: 'other', createdAt: new Date() });
    await expect(subject.register(data(), 100)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(findBooking).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('looks up retries under the tenant-scoped compound key and maps money exactly', async () => {
    retryLookup.mockResolvedValueOnce({ id: 'existing', ...data(), amountMinor: 40n, createdAt: new Date() });
    await expect(subject.findByIdempotencyKey(data().businessId, data().idempotencyKey)).resolves.toMatchObject({ id: 'existing', amountMinor: 40 });
    expect(retryLookup).toHaveBeenCalledWith({ where: { businessId_idempotencyKey: { businessId: data().businessId, idempotencyKey: data().idempotencyKey } } });
  });

  it('lists only public fields with tenant-scoped deterministic keyset pagination', async () => {
    findMany.mockResolvedValue([]);
    const before = { paidAt: new Date('2026-09-09T18:00:00.000Z'), createdAt: new Date('2026-09-09T18:01:00.000Z'), id: '33333333-3333-4333-8333-333333333333' };
    await subject.listByBooking({ businessId: data().businessId, bookingId: data().bookingId, before, limit: 51 });
    expect(findMany).toHaveBeenCalledWith({
      where: { businessId: data().businessId, bookingId: data().bookingId, OR: [{ paidAt: { lt: before.paidAt } }, { paidAt: before.paidAt, createdAt: { lt: before.createdAt } }, { paidAt: before.paidAt, createdAt: before.createdAt, id: { lt: before.id } }] },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      select: { id: true, bookingId: true, amountMinor: true, currency: true, method: true, reference: true, note: true, paidAt: true, createdAt: true, recordedByUserId: true, status: true },
    });
  });
  it('rejects a pending confirmation if the resource capacity changed after booking creation', async () => {
    findBooking.mockResolvedValue({ ...currentBooking('PENDING'), adults: 2, children: 0 });
    findResource.mockResolvedValue({ capacityMaximum: 1, capacityMaximumChildren: 0 });
    await expect(subject.register(data(), 100)).rejects.toThrow('capacidad vigente');
    expect(create).not.toHaveBeenCalled();
    expect(updateBooking).not.toHaveBeenCalled();
    expect(timelineCreate).not.toHaveBeenCalled();
  });
});
