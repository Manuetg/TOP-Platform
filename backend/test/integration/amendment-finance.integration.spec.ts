import { PrismaClient, type BookingStatus } from '@prisma/client';
import { PrismaBookingFinancialSummaryReader } from '../../src/modules/booking/infrastructure/prisma-booking-financial-summary.reader';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaPricingSnapshotRepository } from '../../src/modules/pricing/infrastructure/prisma-pricing-snapshot.repository';
import { GetOutstandingBalanceUseCase } from '../../src/modules/payment/application/get-outstanding-balance.use-case';
import { RegisterPaymentUseCase } from '../../src/modules/payment/application/register-payment.use-case';
import { PaymentMethod } from '../../src/modules/payment/domain/payment';
import { PrismaOutstandingBalanceRepository } from '../../src/modules/payment/infrastructure/prisma-outstanding-balance.repository';
import { PrismaPaymentPlanRepository } from '../../src/modules/payment/infrastructure/prisma-payment-plan.repository';
import { PrismaPaymentRepository } from '../../src/modules/payment/infrastructure/prisma-payment.repository';
import { assertTestDatabase, cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const declaredTestDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Booking amendments financial consumers with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const payments = new PrismaPaymentRepository(prisma);
  const plans = new PrismaPaymentPlanRepository(prisma);
  const summaries = new PrismaBookingFinancialSummaryReader(prisma);
  const bookings = new PrismaBookingRepository(prisma);
  const businesses = new PrismaBusinessRepository(prisma);
  const snapshots = new PrismaPricingSnapshotRepository(prisma);
  const register = new RegisterPaymentUseCase(payments, bookings, snapshots, businesses);
  const balance = new GetOutstandingBalanceUseCase(new PrismaOutstandingBalanceRepository(prisma), bookings, snapshots, businesses);
  let safeToClean = false;

  beforeAll(async () => {
    assertTestDatabase(databaseUrl);
    if (declaredTestDatabaseUrl && declaredTestDatabaseUrl !== databaseUrl) throw new Error('Las URLs de prueba deben identificar la misma base sintética.');
    safeToClean = true;
    await prisma.$connect();
  });
  beforeEach(async () => {
    if (!safeToClean) throw new Error('La base sintética no pasó los guards.');
    await cleanTestDatabase(prisma, databaseUrl);
  });
  afterEach(async () => {
    if (safeToClean) await cleanTestDatabase(prisma, databaseUrl);
  });
  afterAll(async () => prisma.$disconnect());

  async function fixture(status: BookingStatus = 'CONFIRMED') {
    const suffix = crypto.randomUUID();
    const business = await prisma.business.create({ data: { name: 'Amendment finance ' + suffix, currency: 'PYG', timezone: 'America/Asuncion' } });
    const actor = await prisma.user.create({ data: { email: suffix + '@example.invalid' } });
    const contact = await prisma.contact.create({ data: { businessId: business.id, name: 'Synthetic guest' } });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Synthetic room', internalCode: suffix, capacityMaximum: 2 } });
    const booking = await prisma.booking.create({ data: { businessId: business.id, status, contactId: contact.id, adults: 1, children: 0, checkInDate: new Date('2026-11-10'), checkOutDate: new Date('2026-11-12'), resources: { create: { resourceId: resource.id } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 100, items: [] } });
    return { business, actor, booking, snapshot };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function revise(value: Fixture, totalAmountMinor: number, revisionNumber = 1, currency = 'PYG') {
    return prisma.pricingRevision.create({ data: {
      businessId: value.business.id, bookingId: value.booking.id, originalSnapshotId: value.snapshot.id,
      revisionNumber, currency, totalAmountMinor, items: [], previousPricing: {}, beforeContext: {}, afterContext: {},
      paidAmountMinorAtSave: 0, actorUserId: value.actor.id, reason: 'Synthetic authorized amendment',
    } });
  }
  const paymentInput = (value: Fixture, key: string, amountMinor: number) => ({
    businessId: value.business.id, bookingId: value.booking.id, amountMinor, method: PaymentMethod.CASH,
    paidAt: '2026-01-01T12:00:00.000Z', idempotencyKey: key, actorUserId: value.actor.id,
  });
  const planData = (value: Fixture, totalAmountMinor = 100, currentPricingId?: string) => ({
    businessId: value.business.id, bookingId: value.booking.id, currency: 'PYG', totalAmountMinor, currentPricingId,
    actorUserId: value.actor.id, installments: [{ amountMinor: totalAmountMinor, dueDate: new Date('2020-01-01'), sortOrder: 0 }],
  });

  it('reads a reduced current total as credit while retaining original price and effective payments', async () => {
    const value = await fixture();
    const payment = await register.execute(paymentInput(value, 'original-full-payment', 100));
    await revise(value, 80);
    expect((await summaries.read(value.business.id, [value.booking.id])).get(value.booking.id)).toMatchObject({ totalAmountMinor: 80, paidAmountMinor: 100, outstandingAmountMinor: 0, creditAmountMinor: 20, currency: 'PYG' });
    await expect(balance.execute(value.business.id, value.booking.id)).resolves.toMatchObject({ totalAmountMinor: 80, paidAmountMinor: 100, outstandingAmountMinor: 0, creditAmountMinor: 20, needsReconciliation: true, overdueAmountMinor: null, nextDueDate: null, nextDueAmountMinor: null });
    expect(await prisma.pricingSnapshot.findUnique({ where: { id: value.snapshot.id } })).toEqual(value.snapshot);
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ amountMinor: 100n });
  });

  it('keeps old installments and applications while new payments remain unapplied during a price mismatch', async () => {
    const value = await fixture();
    const originalPlan = await plans.create(planData(value));
    await register.execute(paymentInput(value, 'before-reduction', 40));
    const before = await plans.findByBooking({ businessId: value.business.id, bookingId: value.booking.id });
    await revise(value, 80);
    const newPayment = await register.execute(paymentInput(value, 'during-reduction', 10));
    const after = await plans.findByBooking({ businessId: value.business.id, bookingId: value.booking.id });
    expect(after).toMatchObject({ id: originalPlan.id, totalAmountMinor: 100, needsReconciliation: true, warning: expect.any(String) });
    expect(after?.installments).toEqual(before?.installments);
    expect(await prisma.paymentApplication.count({ where: { paymentId: newPayment.id } })).toBe(0);
    await expect(balance.execute(value.business.id, value.booking.id)).resolves.toMatchObject({ totalAmountMinor: 80, paidAmountMinor: 50, outstandingAmountMinor: 30, creditAmountMinor: 0, needsReconciliation: true, overdueAmountMinor: null });
  });

  it('still warns after 100→80→unapplied payment→100 because the payment gap remains', async () => {
    const value = await fixture();
    await plans.create(planData(value));
    await register.execute(paymentInput(value, 'initial-applied', 40));
    await revise(value, 80);
    await register.execute(paymentInput(value, 'unapplied', 10));
    await revise(value, 100, 2);
    const laterPayment = await register.execute(paymentInput(value, 'later-with-historical-gap', 10));
    expect(await prisma.paymentApplication.count({ where: { paymentId: laterPayment.id } })).toBe(0);
    await expect(plans.findByBooking({ businessId: value.business.id, bookingId: value.booking.id })).resolves.toMatchObject({ totalAmountMinor: 100, needsReconciliation: true, warning: expect.any(String) });
    await expect(balance.execute(value.business.id, value.booking.id)).resolves.toMatchObject({ totalAmountMinor: 100, paidAmountMinor: 60, outstandingAmountMinor: 40, needsReconciliation: true, overdueAmountMinor: null, nextDueDate: null });
    expect(await prisma.paymentApplication.aggregate({ _sum: { amountMinor: true } })).toMatchObject({ _sum: { amountMinor: 40n } });
  });

  it('does not warn merely because a new revision restores the same amount with no application gap', async () => {
    const value = await fixture();
    await plans.create(planData(value));
    await register.execute(paymentInput(value, 'fully-applied', 40));
    await revise(value, 80);
    await revise(value, 100, 2);
    await expect(plans.findByBooking({ businessId: value.business.id, bookingId: value.booking.id })).resolves.toMatchObject({ needsReconciliation: false, warning: null });
    await expect(balance.execute(value.business.id, value.booking.id)).resolves.toMatchObject({ totalAmountMinor: 100, paidAmountMinor: 40, outstandingAmountMinor: 60, needsReconciliation: false, overdueAmountMinor: 60 });
  });

  it('confirms first Pending payment against an increased revision and keeps original Snapshot unchanged', async () => {
    const value = await fixture('PENDING');
    await revise(value, 200);
    await expect(register.execute(paymentInput(value, 'first-current-price', 150))).resolves.toMatchObject({ amountMinor: 150 });
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ status: 'CONFIRMED' });
    expect(await prisma.pricingSnapshot.findUnique({ where: { id: value.snapshot.id } })).toEqual(value.snapshot);
  });

  it('rejects stale plan writes under locks even if the amount later returns to its previous value', async () => {
    const value = await fixture();
    const staleData = planData(value, 100, value.snapshot.id);
    await revise(value, 100);
    await expect(plans.create(staleData)).rejects.toThrow('PAYMENT_PLAN_PRICE_CHANGED');
    expect(await prisma.paymentPlan.count()).toBe(0);
  });

  it('creates a new plan from current pricing and applies compatible historical payments', async () => {
    const value = await fixture();
    const revision = await revise(value, 80);
    await register.execute(paymentInput(value, 'compatible-old-payment', 20));
    await expect(plans.create(planData(value, 80, revision.id))).resolves.toMatchObject({ totalAmountMinor: 80, needsReconciliation: false, installments: [{ appliedAmountMinor: 20 }] });
  });

  it('allows explicit replacement without applications while leaving existing unapplied payments intact', async () => {
    const value = await fixture();
    const original = await plans.create(planData(value));
    const revision = await revise(value, 80);
    const payment = await register.execute(paymentInput(value, 'unapplied-before-manual-replace', 20));
    const replaced = await plans.replace(planData(value, 80, revision.id));
    expect(replaced).toMatchObject({ id: original.id, totalAmountMinor: 80, needsReconciliation: true });
    expect(replaced.installments[0].appliedAmountMinor).toBe(0);
    expect(await prisma.paymentApplication.count({ where: { paymentId: payment.id } })).toBe(0);
  });

  it('returns a clear conflict before trying to apply credit to a newly created plan', async () => {
    const value = await fixture();
    await register.execute(paymentInput(value, 'full-before-reduction', 100));
    const revision = await revise(value, 80);
    await expect(plans.create(planData(value, 80, revision.id))).rejects.toThrow('PAYMENT_PLAN_CREDIT_REQUIRES_RECONCILIATION');
    expect(await prisma.paymentPlan.count()).toBe(0);
  });

  it('returns an existing idempotent payment after revision and cancellation without creating applications', async () => {
    const value = await fixture();
    const input = paymentInput(value, 'retry-original', 20);
    const original = await register.execute(input);
    await revise(value, 10);
    await prisma.booking.update({ where: { id: value.booking.id }, data: { status: 'CANCELLED' } });
    await expect(register.execute(input)).resolves.toEqual(original);
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.paymentApplication.count()).toBe(0);
  });
});
