import { PrismaClient, type BookingStatus } from '@prisma/client';
import { RegisterPaymentUseCase, PaymentConflictError, PaymentInputError } from '../../src/modules/payment/application/register-payment.use-case';
import { PaymentMethod, PaymentStatus, type RegisterPaymentData } from '../../src/modules/payment/domain/payment';
import { PrismaPaymentRepository } from '../../src/modules/payment/infrastructure/prisma-payment.repository';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaPricingSnapshotRepository } from '../../src/modules/pricing/infrastructure/prisma-pricing-snapshot.repository';
import { assertTestDatabase, cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const declaredTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const hasTestDatabase = (() => {
  if (!databaseUrl) return false;
  try { return new URL(databaseUrl).pathname.toLowerCase().includes('test'); }
  catch { return false; }
})();
const describeWithPostgres = hasTestDatabase ? describe : describe.skip;

describeWithPostgres('Pending first payment with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const payments = new PrismaPaymentRepository(prisma);
  const bookings = new PrismaBookingRepository(prisma);
  const businesses = new PrismaBusinessRepository(prisma);
  const snapshots = new PrismaPricingSnapshotRepository(prisma);
  const register = new RegisterPaymentUseCase(payments, bookings, snapshots, businesses);
  const failingActor = '00000000-0000-4000-8000-000000000002';
  let safeToClean = false;

  beforeAll(async () => {
    assertTestDatabase(databaseUrl);
    if (declaredTestDatabaseUrl && declaredTestDatabaseUrl !== databaseUrl) {
      throw new Error('TEST_DATABASE_URL y DATABASE_URL deben identificar la misma base sintética.');
    }
    safeToClean = true;
    await prisma.$connect();
  });
  beforeEach(async () => {
    if (!safeToClean) throw new Error('La base sintética no pasó los guards de pruebas.');
    await cleanTestDatabase(prisma, databaseUrl);
  });
  afterEach(async () => {
    if (safeToClean) await cleanTestDatabase(prisma, databaseUrl);
  });
  afterAll(async () => prisma.$disconnect());

  async function fixture(total = 1_000_000, status: BookingStatus = 'PENDING') {
    const suffix = crypto.randomUUID();
    const business = await prisma.business.create({ data: { name: 'Pending payment ' + suffix, timezone: 'America/Asuncion', currency: 'PYG' } });
    const contact = await prisma.contact.create({ data: { businessId: business.id, name: 'Synthetic guest', email: suffix + '@example.invalid' } });
    const actor = await prisma.user.create({ data: { email: 'actor-' + suffix + '@example.invalid' } });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Synthetic room', internalCode: suffix, capacityMaximum: 2 } });
    const booking = await prisma.booking.create({ data: { businessId: business.id, status, contactId: contact.id, checkInDate: new Date('2026-10-10'), checkOutDate: new Date('2026-10-12'), adults: 1, children: 0, resources: { create: { resourceId: resource.id } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: {
      businessId: business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: total,
      items: [{ resourceId: resource.id, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, adjustmentAmountMinor: null, agreedAmountMinor: total, overrideReason: 'Acuerdo de prueba sintético', nights: 2, breakdown: [] }],
    } });
    return { business, contact, actor, resource, booking, snapshot };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const input = (value: Fixture, key: string, amountMinor = 1) => ({ businessId: value.business.id, bookingId: value.booking.id, amountMinor, method: PaymentMethod.CASH, paidAt: '2026-01-01T12:00:00.000Z', idempotencyKey: key, actorUserId: value.actor.id });
  const repositoryData = (value: Fixture, key: string, amountMinor = 1): RegisterPaymentData => ({
    businessId: value.business.id, bookingId: value.booking.id, amountMinor, currency: 'PYG', method: PaymentMethod.CASH,
    reference: null, note: null, paidAt: new Date('2026-01-01T12:00:00.000Z'), recordedByUserId: value.actor.id,
    status: PaymentStatus.RECORDED, idempotencyKey: key, requestFingerprint: 'fp:' + key + ':' + amountMinor,
  });

  async function expectUnpaidPending(value: Fixture) {
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'PENDING' });
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(0);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(0);
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(value.snapshot);
  }

  async function anotherPending(value: Fixture, useSameResource = true) {
    const resource = useSameResource ? value.resource : await prisma.resource.create({ data: { businessId: value.business.id, name: 'Second synthetic room', internalCode: crypto.randomUUID(), capacityMaximum: 2 } });
    const booking = await prisma.booking.create({ data: { businessId: value.business.id, status: 'PENDING', contactId: value.contact.id, checkInDate: value.booking.checkInDate, checkOutDate: value.booking.checkOutDate, adults: 1, children: 0, resources: { create: { resourceId: resource.id } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: value.business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: value.snapshot.totalAmountMinor, items: [{ resourceId: resource.id, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, adjustmentAmountMinor: null, agreedAmountMinor: Number(value.snapshot.totalAmountMinor), overrideReason: 'Segundo acuerdo sintético', nights: 2, breakdown: [] }] } });
    return { ...value, resource, booking, snapshot };
  }

  it('confirms a Pending booking for one unit out of one million and retains its complete snapshot', async () => {
    const value = await fixture();
    const payment = await register.execute(input(value, 'smallest-positive'));
    expect(payment).toMatchObject({ amountMinor: 1, currency: 'PYG', status: 'RECORDED', recordedByUserId: value.actor.id });
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'CONFIRMED' });
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ amountMinor: 1n, status: 'RECORDED' });
    const events = await prisma.bookingTimelineEvent.findMany({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ businessId: value.business.id, actorUserId: value.actor.id, details: { paymentId: payment.id } });
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(value.snapshot);
  });

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('does not record or confirm an invalid payment %p', async (amountMinor) => {
    const value = await fixture();
    await expect(register.execute(input(value, 'invalid-amount', amountMinor))).rejects.toBeInstanceOf(PaymentInputError);
    await expectUnpaidPending(value);
  });

  it('does not confirm or record an overpayment', async () => {
    const value = await fixture(100);
    await expect(register.execute(input(value, 'overpayment', 101))).rejects.toThrow('OVERPAYMENT');
    await expectUnpaidPending(value);
  });

  it('does not manufacture a payment or confirmation for a zero-price Pending booking', async () => {
    const value = await fixture(0);
    await expect(register.execute(input(value, 'free-stay-zero', 0))).rejects.toBeInstanceOf(PaymentInputError);
    await expect(register.execute(input(value, 'free-stay-positive', 1))).rejects.toThrow('OVERPAYMENT');
    await expectUnpaidPending(value);
  });

  it('preserves operational progress when subsequent payments arrive', async () => {
    const value = await fixture(100);
    await register.execute(input(value, 'initial', 1));
    await register.execute(input(value, 'second', 1));
    for (const status of ['IN_PROGRESS', 'COMPLETED'] as const) {
      await prisma.booking.update({ where: { id: value.booking.id }, data: { status } });
      await register.execute(input(value, 'payment-' + status, 1));
      expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status });
    }
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(4);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(value.snapshot);
  });

  it.each(['DRAFT', 'CANCELLED', 'NO_SHOW'] as const)('rejects a new collection for historical %s without changing it', async (status) => {
    const value = await fixture(100, status);
    await expect(register.execute(input(value, 'ineligible-state'))).rejects.toBeInstanceOf(PaymentConflictError);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status });
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(0);
  });

  it('rolls back first payment when a conflicting confirmed booking now occupies the resource', async () => {
    const value = await fixture();
    await prisma.booking.create({ data: { businessId: value.business.id, status: 'CONFIRMED', contactId: value.contact.id, checkInDate: value.booking.checkInDate, checkOutDate: value.booking.checkOutDate, resources: { create: { resourceId: value.resource.id } } } });
    await expect(register.execute(input(value, 'booking-conflict'))).rejects.toBeInstanceOf(PaymentConflictError);
    await expectUnpaidPending(value);
  });

  it('rolls back first payment when a scheduled block now intersects the stay', async () => {
    const value = await fixture();
    await prisma.block.create({ data: { businessId: value.business.id, resourceId: value.resource.id, type: 'MAINTENANCE', reason: 'Synthetic block', startsAt: new Date('2026-10-10T00:00:00.000Z'), endsAt: new Date('2026-10-11T00:00:00.000Z') } });
    await expect(register.execute(input(value, 'block-conflict'))).rejects.toBeInstanceOf(PaymentConflictError);
    await expectUnpaidPending(value);
  });

  it.each([0, 1])('respects the existing checkout boundary and a bufferAfterDays=%i rule before first payment', async (bufferAfterDays) => {
    const value = await fixture(100);
    await prisma.availabilityRule.create({ data: { businessId: value.business.id, pendingBlocksAvailability: true, bufferBeforeDays: 0, bufferAfterDays } });
    await prisma.booking.create({ data: { businessId: value.business.id, status: 'CONFIRMED', contactId: value.contact.id, checkInDate: new Date('2026-10-08'), checkOutDate: new Date('2026-10-10'), resources: { create: { resourceId: value.resource.id } } } });
    if (bufferAfterDays === 0) {
      await expect(register.execute(input(value, 'adjacent-no-buffer'))).resolves.toMatchObject({ status: 'RECORDED' });
      expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'CONFIRMED' });
    } else {
      await expect(register.execute(input(value, 'adjacent-with-buffer'))).rejects.toBeInstanceOf(PaymentConflictError);
      await expectUnpaidPending(value);
    }
  });

  it.each(['OUT_OF_SERVICE', 'ARCHIVED'] as const)('does not confirm or collect after Resource becomes %s', async (status) => {
    const value = await fixture();
    await prisma.resource.update({ where: { id: value.resource.id }, data: { status } });
    await expect(register.execute(input(value, 'inactive-resource'))).rejects.toBeInstanceOf(PaymentConflictError);
    await expectUnpaidPending(value);
  });

  it('rechecks a stale preflight Booking state inside the payment transaction', async () => {
    const value = await fixture();
    const stale = await bookings.findByIdAndBusinessId(value.booking.id, value.business.id);
    await prisma.booking.update({ where: { id: value.booking.id }, data: { status: 'CANCELLED' } });
    const staleLookup = { findByIdAndBusinessId: jest.fn().mockResolvedValue(stale) };
    const staleRegister = new RegisterPaymentUseCase(payments, staleLookup as never, snapshots, businesses);
    await expect(staleRegister.execute(input(value, 'stale-pending'))).rejects.toBeInstanceOf(PaymentConflictError);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(0);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id } })).toBe(0);
  });

  it('uses the canonical snapshot total rather than a stale repository caller total', async () => {
    const value = await fixture(50, 'CONFIRMED');
    await expect(payments.register(repositoryData(value, 'stale-total', 70), 1_000)).rejects.toThrow('OVERPAYMENT');
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(0);
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(value.snapshot);
  });

  it('rejects a Booking whose contact belongs to another tenant', async () => {
    const value = await fixture();
    const other = await fixture();
    await prisma.booking.update({ where: { id: value.booking.id }, data: { contactId: other.contact.id } });
    await expect(register.execute(input(value, 'foreign-contact'))).rejects.toBeInstanceOf(PaymentConflictError);
    await expectUnpaidPending(value);
  });

  it('rolls back Payment, plan allocation and confirmation together if timeline insertion fails', async () => {
    const value = await fixture(100);
    const plan = await prisma.paymentPlan.create({ data: { businessId: value.business.id, bookingId: value.booking.id, currency: 'PYG', totalAmountMinor: 100, createdByUserId: value.actor.id, updatedByUserId: value.actor.id, installments: { create: [{ amountMinor: 100, sortOrder: 0 }] } } });
    await prisma.$executeRawUnsafe('CREATE OR REPLACE FUNCTION fail_test_pending_payment_timeline() RETURNS trigger AS $$ BEGIN IF NEW."actorUserId" = \'' + failingActor + '\' AND NEW."type" = \'BOOKING_CONFIRMED\' THEN RAISE EXCEPTION \'forced pending payment timeline failure\'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql');
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_test_pending_payment_timeline_trigger BEFORE INSERT ON "BookingTimelineEvent" FOR EACH ROW EXECUTE FUNCTION fail_test_pending_payment_timeline()');
    try {
      await expect(register.execute({ ...input(value, 'timeline-rollback', 40), actorUserId: failingActor })).rejects.toThrow();
      await expectUnpaidPending(value);
      expect(await prisma.paymentApplication.count({ where: { installment: { paymentPlanId: plan.id } } })).toBe(0);
      expect(await prisma.paymentPlan.count({ where: { id: plan.id } })).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_test_pending_payment_timeline_trigger ON "BookingTimelineEvent"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_test_pending_payment_timeline()');
    }
    await register.execute(input(value, 'timeline-rollback', 40));
    expect(await prisma.paymentApplication.aggregate({ where: { installment: { paymentPlanId: plan.id } }, _sum: { amountMinor: true } })).toEqual({ _sum: { amountMinor: 40n } });
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
  });

  it('deduplicates simultaneous retries and creates only one payment and confirmation', async () => {
    const value = await fixture(100);
    const request = input(value, 'concurrent-retry', 40);
    const results = await Promise.all([register.execute(request), register.execute(request)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(1);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
  });

  it('serializes different first-payment keys for one Booking without duplicate confirmation', async () => {
    const value = await fixture(100);
    await Promise.all([register.execute(input(value, 'first-a', 40)), register.execute(input(value, 'first-b', 40))]);
    expect(await prisma.payment.aggregate({ where: { bookingId: value.booking.id }, _sum: { amountMinor: true } })).toEqual({ _sum: { amountMinor: 80n } });
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'CONFIRMED' });
  });

  it('allows only one of two concurrent payments that would jointly exceed the total', async () => {
    const value = await fixture(100);
    const results = await Promise.allSettled([register.execute(input(value, 'over-a', 70)), register.execute(input(value, 'over-b', 70))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ message: 'OVERPAYMENT' });
    expect(await prisma.payment.aggregate({ where: { bookingId: value.booking.id }, _sum: { amountMinor: true } })).toEqual({ _sum: { amountMinor: 70n } });
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
  });

  it('allows only one concurrent paid confirmation for conflicting Pending bookings when Pending does not block', async () => {
    const value = await fixture(100);
    await prisma.availabilityRule.create({ data: { businessId: value.business.id, pendingBlocksAvailability: false, bufferBeforeDays: 0, bufferAfterDays: 0 } });
    const other = await anotherPending(value);
    const results = await Promise.allSettled([register.execute(input(value, 'room-a', 1)), register.execute(input(other, 'room-b', 1))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(PaymentConflictError);
    const ids = [value.booking.id, other.booking.id];
    expect(await prisma.booking.count({ where: { id: { in: ids }, status: 'CONFIRMED' } })).toBe(1);
    expect(await prisma.booking.count({ where: { id: { in: ids }, status: 'PENDING' } })).toBe(1);
    expect(await prisma.payment.count({ where: { bookingId: { in: ids } } })).toBe(1);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: { in: ids }, type: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.pricingSnapshot.count({ where: { bookingId: { in: ids } } })).toBe(2);
  });

  it('returns a payload conflict rather than a unique-key failure when one tenant key targets different bookings concurrently', async () => {
    const value = await fixture(100);
    const other = await anotherPending(value, false);
    const results = await Promise.allSettled([register.execute(input(value, 'one-key', 1)), register.execute(input(other, 'one-key', 1))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ message: 'IDEMPOTENCY_CONFLICT' });
    expect(await prisma.payment.count({ where: { businessId: value.business.id, idempotencyKey: 'one-key' } })).toBe(1);
    expect(await prisma.bookingTimelineEvent.count({ where: { businessId: value.business.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
  });

  it('returns the original committed payment after cancellation and Business archive while rejecting new or changed requests', async () => {
    const value = await fixture(100);
    const request = input(value, 'committed-retry', 40);
    const original = await register.execute(request);
    await prisma.booking.update({ where: { id: value.booking.id }, data: { status: 'CANCELLED' } });
    await prisma.business.update({ where: { id: value.business.id }, data: { status: 'ARCHIVED' } });
    await expect(register.execute(request)).resolves.toMatchObject({ id: original.id, amountMinor: 40, recordedByUserId: value.actor.id });
    await expect(register.execute({ ...request, amountMinor: 41 })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(register.execute({ ...request, idempotencyKey: 'new-after-archive' })).rejects.toBeInstanceOf(PaymentConflictError);
    expect(await prisma.payment.count({ where: { bookingId: value.booking.id } })).toBe(1);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'CANCELLED' });
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: value.booking.id } })).toEqual(value.snapshot);
  });

  it('keeps identical idempotency keys isolated between tenants', async () => {
    const first = await fixture(100);
    const second = await fixture(100);
    const results = await Promise.all([register.execute(input(first, 'shared-key')), register.execute(input(second, 'shared-key'))]);
    expect(results[0].id).not.toBe(results[1].id);
    expect(results.map((result) => result.businessId).sort()).toEqual([first.business.id, second.business.id].sort());
    expect(await prisma.payment.count({ where: { idempotencyKey: 'shared-key' } })).toBe(2);
  });
  it('does not record or confirm when capacity is reduced below the pending guest count', async () => {
    const value = await fixture();
    await prisma.booking.update({ where: { id: value.booking.id }, data: { adults: 2, children: 0 } });
    await prisma.resource.update({ where: { id: value.resource.id }, data: { capacityMaximum: 1 } });
    await expect(register.execute(input(value, 'capacity-changed'))).rejects.toBeInstanceOf(PaymentConflictError);
    await expectUnpaidPending(value);
  });
});
