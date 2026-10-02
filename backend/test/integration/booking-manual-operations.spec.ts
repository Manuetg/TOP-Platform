import { PrismaClient, type Booking, type MembershipRole } from '@prisma/client';
import { BookingOperation, BOOKING_OPERATION_TRANSITIONS } from '../../src/modules/booking-lifecycle/booking-operation.contract';
import { OperateBookingUseCase } from '../../src/modules/booking-lifecycle/application/operate-booking.use-case';
import { BookingOperationConflictError, BookingOperationForbiddenError } from '../../src/modules/booking-lifecycle/application/booking-operation.errors';
import { PrismaBookingOperationTransaction } from '../../src/modules/booking-lifecycle/infrastructure/prisma-booking-operation.transaction';
import { BookingNotFoundError, BookingStatus } from '../../src/modules/booking/booking.contract';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { CancelBookingUseCase } from '../../src/modules/booking-lifecycle/application/cancel-booking.use-case';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
const version = new Date('2030-01-01T12:00:00.123Z');

describeWithPostgres('Operaciones manuales de reservas en PostgreSQL', () => {
  const prisma = new PrismaClient();
  const operations = new OperateBookingUseCase(new PrismaBookingOperationTransaction(prisma));
  const bookings = new PrismaBookingRepository(prisma);
  const cancel = new CancelBookingUseCase(new PrismaBusinessRepository(prisma), bookings);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  async function fixture(status: BookingStatus = BookingStatus.CONFIRMED, total = 100, role: MembershipRole = 'RECEPTIONIST') {
    const business = await prisma.business.create({ data: { name: `Operaciones ${crypto.randomUUID()}` } });
    const actor = await prisma.user.create({ data: { email: `${crypto.randomUUID()}@operations.test` } });
    const membership = await prisma.userBusinessMembership.create({ data: { businessId: business.id, userId: actor.id, role } });
    const contact = await prisma.contact.create({ data: { businessId: business.id, name: 'Huésped sintético' } });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabaña sintética', internalCode: 'OPS', capacityMaximum: 4, capacityMaximumChildren: 2 } });
    const booking = await prisma.booking.create({ data: { businessId: business.id, status, contactId: contact.id, checkInDate: new Date('2026-01-01'), checkOutDate: new Date('2026-01-03'), adults: 2, children: 1, notes: 'Conservar', updatedAt: version, resources: { create: { resourceId: resource.id } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: total, items: [{ resourceId: resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: total, overrideReason: 'Acuerdo de prueba', nights: 2, breakdown: [] }] } });
    return { business, actor, membership, contact, resource, booking, snapshot };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const input = (value: Fixture, operation: BookingOperation, current: Booking = value.booking) => ({ businessId: value.business.id, bookingId: current.id, actorUserId: value.actor.id, operation, expectedUpdatedAt: current.updatedAt.toISOString(), reason: 'Acción manual de prueba' });

  it.each([
    [BookingOperation.CHECK_IN, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, 'BOOKING_CHECKED_IN'],
    [BookingOperation.CHECK_OUT, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, 'BOOKING_CHECKED_OUT'],
    [BookingOperation.NO_SHOW, BookingStatus.CONFIRMED, BookingStatus.NO_SHOW, 'BOOKING_MARKED_NO_SHOW'],
  ] as const)('registra %s sin condiciones de fecha o deuda y conserva historia financiera', async (operation, from, to, event) => {
    const value = await fixture(from);
    const plan = await prisma.paymentPlan.create({ data: { businessId: value.business.id, bookingId: value.booking.id, currency: 'PYG', totalAmountMinor: 100, createdByUserId: value.actor.id, updatedByUserId: value.actor.id, installments: { create: { amountMinor: 100, sortOrder: 0 } } } });
    const payment = await prisma.payment.create({ data: { businessId: value.business.id, bookingId: value.booking.id, amountMinor: 40, currency: 'PYG', method: 'CASH', paidAt: new Date('2026-01-01'), recordedByUserId: value.actor.id, idempotencyKey: 'preserve', requestFingerprint: 'preserve' } });
    const installment = await prisma.paymentPlanInstallment.findFirstOrThrow({ where: { paymentPlanId: plan.id } });
    const application = await prisma.paymentApplication.create({ data: { paymentId: payment.id, installmentId: installment.id, amountMinor: 40 } });
    await expect(operations.execute(input(value, operation))).resolves.toMatchObject({ status: to });
    const changed = await prisma.booking.findUniqueOrThrow({ where: { id: value.booking.id } });
    expect(changed).toEqual({ ...value.booking, status: to, updatedAt: new Date(version.getTime() + 1) });
    expect(await prisma.pricingSnapshot.findUnique({ where: { id: value.snapshot.id } })).toEqual(value.snapshot);
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toEqual(payment);
    expect(await prisma.paymentPlan.findUnique({ where: { id: plan.id } })).toEqual(plan);
    expect(await prisma.paymentApplication.findUnique({ where: { paymentId_installmentId: { paymentId: payment.id, installmentId: installment.id } } })).toEqual(application);
    expect(await prisma.bookingTimelineEvent.findMany({ where: { bookingId: value.booking.id } })).toEqual([expect.objectContaining({ type: event, actorUserId: value.actor.id, details: { source: 'MANUAL', operation, beforeStatus: from, afterStatus: to, beforeUpdatedAt: version.toISOString(), afterUpdatedAt: changed.updatedAt.toISOString(), reason: 'Acción manual de prueba' } })]);
  });

  it('confirma total cero con Snapshot intacto, sin Payment ni PaymentApplication artificial', async () => {
    const value = await fixture(BookingStatus.PENDING, 0);
    await expect(operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT))).resolves.toMatchObject({ status: BookingStatus.CONFIRMED });
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentApplication.count()).toBe(0);
    expect(await prisma.pricingSnapshot.findUnique({ where: { id: value.snapshot.id } })).toEqual(value.snapshot);
    expect(await prisma.bookingTimelineEvent.findMany({ where: { bookingId: value.booking.id } })).toEqual([expect.objectContaining({ type: 'BOOKING_CONFIRMED', actorUserId: value.actor.id, details: expect.objectContaining({ source: 'FREE_CONFIRM', beforeStatus: 'PENDING', afterStatus: 'CONFIRMED' }) })]);
  });

  it.each([
    { original: 0, current: 100, eligible: false },
    { original: 100, current: 0, eligible: true },
  ])('confirma sin cobro según precio vigente $current y conserva el original $original', async ({ original, current, eligible }) => {
    const value = await fixture(BookingStatus.PENDING, original);
    const revision = await prisma.pricingRevision.create({ data: {
      businessId: value.business.id, bookingId: value.booking.id, originalSnapshotId: value.snapshot.id,
      revisionNumber: 1, currency: 'PYG', totalAmountMinor: current,
      items: [{ resourceId: value.resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: current, overrideReason: 'Cambio acordado de prueba', nights: 2, breakdown: [] }],
      previousPricing: { id: value.snapshot.id, totalAmountMinor: original }, beforeContext: {}, afterContext: {},
      paidAmountMinorAtSave: 0, actorUserId: value.actor.id,
    } });
    const request = operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT));
    if (eligible) {
      await expect(request).resolves.toMatchObject({ status: BookingStatus.CONFIRMED });
      expect(await prisma.bookingTimelineEvent.findMany({ where: { bookingId: value.booking.id } })).toEqual([
        expect.objectContaining({ type: 'BOOKING_CONFIRMED', details: expect.objectContaining({ source: 'FREE_CONFIRM' }) }),
      ]);
    } else {
      await expect(request).rejects.toBeInstanceOf(BookingOperationConflictError);
      expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toEqual(value.booking);
      expect(await prisma.bookingTimelineEvent.count()).toBe(0);
    }
    expect(await prisma.pricingSnapshot.findUnique({ where: { id: value.snapshot.id } })).toEqual(value.snapshot);
    expect(await prisma.pricingRevision.findUnique({ where: { id: revision.id } })).toEqual(revision);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentApplication.count()).toBe(0);
  });

  it.each([0, 1])('rechaza confirmación gratuita sin precio o con total positivo (%s)', async (total) => {
    const value = await fixture(BookingStatus.PENDING, total);
    if (total === 0) await prisma.pricingSnapshot.delete({ where: { id: value.snapshot.id } });
    await expect(operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT))).rejects.toBeInstanceOf(BookingOperationConflictError);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toEqual(value.booking);
    expect(await prisma.bookingTimelineEvent.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  const forbiddenTransitions = Object.values(BookingOperation).flatMap((operation) => Object.values(BookingStatus)
    .filter((status) => status !== BOOKING_OPERATION_TRANSITIONS[operation].from).map((status) => ({ operation, status })));
  it.each(forbiddenTransitions)('rechaza $operation desde $status sin modificar la reserva', async ({ operation, status }) => {
    const value = await fixture(status, 0);
    await expect(operations.execute(input(value, operation))).rejects.toBeInstanceOf(BookingOperationConflictError);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toEqual(value.booking);
    expect(await prisma.bookingTimelineEvent.count()).toBe(0);
  });

  it.each(['OWNER', 'ADMIN', 'RECEPTIONIST'] as const)('autoriza %s con su membresía vigente', async (role) => {
    const value = await fixture(BookingStatus.CONFIRMED, 100, role);
    await expect(operations.execute(input(value, BookingOperation.CHECK_IN))).resolves.toMatchObject({ status: BookingStatus.IN_PROGRESS });
  });
  it.each(['VIEWER', 'DISABLED', 'NO_MEMBERSHIP'] as const)('rechaza actor %s dentro de la transacción', async (denial) => {
    const value = await fixture();
    if (denial === 'VIEWER') await prisma.userBusinessMembership.update({ where: { id: value.membership.id }, data: { role: 'VIEWER' } });
    if (denial === 'DISABLED') await prisma.user.update({ where: { id: value.actor.id }, data: { status: 'DISABLED' } });
    if (denial === 'NO_MEMBERSHIP') await prisma.userBusinessMembership.delete({ where: { id: value.membership.id } });
    await expect(operations.execute(input(value, BookingOperation.CHECK_IN))).rejects.toBeInstanceOf(BookingOperationForbiddenError);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toEqual(value.booking);
    expect(await prisma.bookingTimelineEvent.count()).toBe(0);
  });
  it.each(['SUSPENDED', 'ARCHIVED'] as const)('rechaza Business %s aunque la membresía sea operativa', async (status) => {
    const value = await fixture();
    await prisma.business.update({ where: { id: value.business.id }, data: { status } });
    await expect(operations.execute(input(value, BookingOperation.CHECK_IN))).rejects.toThrow('no está activo');
    expect(await prisma.bookingTimelineEvent.count()).toBe(0);
  });

  it('oculta una Booking de otro Negocio aun con permiso en ambos', async () => {
    const value = await fixture();
    const other = await prisma.business.create({ data: { name: 'Otro negocio' } });
    await prisma.userBusinessMembership.create({ data: { businessId: other.id, userId: value.actor.id, role: 'OWNER' } });
    await expect(operations.execute({ ...input(value, BookingOperation.CHECK_IN), businessId: other.id })).rejects.toBeInstanceOf(BookingNotFoundError);
    expect(await prisma.bookingTimelineEvent.count()).toBe(0);
  });

  it('detecta versión obsoleta y un retry nunca duplica el evento', async () => {
    const value = await fixture();
    const command = input(value, BookingOperation.CHECK_IN);
    await operations.execute(command);
    await expect(operations.execute(command)).rejects.toBeInstanceOf(BookingOperationConflictError);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id } })).toBe(1);
  });

  it('admite un único comando concurrente y conserva el evento del ganador', async () => {
    const value = await fixture();
    const outcomes = await Promise.allSettled([operations.execute(input(value, BookingOperation.CHECK_IN)), operations.execute(input(value, BookingOperation.NO_SHOW))]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.any(BookingOperationConflictError) })]);
    expect(await prisma.bookingTimelineEvent.count()).toBe(1);
    const current = await prisma.booking.findUniqueOrThrow({ where: { id: value.booking.id } });
    expect(['IN_PROGRESS', 'NO_SHOW']).toContain(current.status);
  });

  it('serializa ingreso contra Cancel y solo una transición gana', async () => {
    const value = await fixture();
    const outcomes = await Promise.allSettled([operations.execute(input(value, BookingOperation.CHECK_IN)), cancel.execute({ businessId: value.business.id, bookingId: value.booking.id, actorUserId: value.actor.id })]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.bookingTimelineEvent.count()).toBe(1);
    expect(['IN_PROGRESS', 'CANCELLED']).toContain((await prisma.booking.findUniqueOrThrow({ where: { id: value.booking.id } })).status);
  });

  it('revalida conflictos y recursos fuera de servicio antes de confirmar gratuita', async () => {
    const value = await fixture(BookingStatus.PENDING, 0);
    await prisma.resource.update({ where: { id: value.resource.id }, data: { status: 'OUT_OF_SERVICE' } });
    await expect(operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT))).rejects.toBeInstanceOf(BookingOperationConflictError);
    await prisma.resource.update({ where: { id: value.resource.id }, data: { status: 'ACTIVE' } });
    await prisma.block.create({ data: { businessId: value.business.id, resourceId: value.resource.id, startsAt: new Date('2026-01-02T00:00:00Z'), endsAt: new Date('2026-01-03T00:00:00Z'), type: 'MAINTENANCE', reason: 'Mantenimiento de prueba' } });
    await expect(operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT))).rejects.toBeInstanceOf(BookingOperationConflictError);
    expect(await prisma.bookingTimelineEvent.count()).toBe(0);
  });

  it('solo una gratuita concurrente puede ocupar el mismo recurso cuando Pendiente no bloquea', async () => {
    const value = await fixture(BookingStatus.PENDING, 0);
    await prisma.availabilityRule.create({ data: { businessId: value.business.id, pendingBlocksAvailability: false } });
    const second = await prisma.booking.create({ data: { businessId: value.business.id, status: 'PENDING', contactId: value.contact.id, checkInDate: value.booking.checkInDate, checkOutDate: value.booking.checkOutDate, adults: 1, children: 0, updatedAt: version, resources: { create: { resourceId: value.resource.id } } } });
    await prisma.pricingSnapshot.create({ data: { businessId: value.business.id, bookingId: second.id, currency: 'PYG', totalAmountMinor: 0, items: [] } });
    const outcomes = await Promise.allSettled([operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT)), operations.execute(input(value, BookingOperation.CONFIRM_WITHOUT_PAYMENT, second))]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.booking.count({ where: { status: 'CONFIRMED' } })).toBe(1);
    expect(await prisma.bookingTimelineEvent.count({ where: { type: 'BOOKING_CONFIRMED' } })).toBe(1);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('mantiene y libera disponibilidad mediante los estados centrales actuales', async () => {
    const value = await fixture();
    const from = value.booking.checkInDate!;
    const to = value.booking.checkOutDate!;
    expect(await bookings.hasBlockingBooking(value.business.id, value.resource.id, from, to)).toBe(true);
    await operations.execute(input(value, BookingOperation.CHECK_IN));
    expect(await bookings.hasBlockingBooking(value.business.id, value.resource.id, from, to)).toBe(true);
    const inProgress = await prisma.booking.findUniqueOrThrow({ where: { id: value.booking.id } });
    await operations.execute(input(value, BookingOperation.CHECK_OUT, inProgress));
    expect(await bookings.hasBlockingBooking(value.business.id, value.resource.id, from, to)).toBe(false);
  });

  it('No show libera disponibilidad sin alterar fechas ni información financiera', async () => {
    const value = await fixture();
    await operations.execute(input(value, BookingOperation.NO_SHOW));
    expect(await bookings.hasBlockingBooking(value.business.id, value.resource.id, value.booking.checkInDate!, value.booking.checkOutDate!)).toBe(false);
    expect(await prisma.pricingSnapshot.findUnique({ where: { id: value.snapshot.id } })).toEqual(value.snapshot);
    expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toMatchObject({ checkInDate: value.booking.checkInDate, checkOutDate: value.booking.checkOutDate });
  });

  it('revierte estado, versión y Timeline si falla la auditoría', async () => {
    const value = await fixture();
    await prisma.$executeRawUnsafe('CREATE FUNCTION fail_operations_test_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION \'forced operations audit failure\'; END; $$ LANGUAGE plpgsql');
    await prisma.$executeRawUnsafe('CREATE TRIGGER fail_operations_test_audit_trigger BEFORE INSERT ON "BookingTimelineEvent" FOR EACH ROW EXECUTE FUNCTION fail_operations_test_audit()');
    try {
      await expect(operations.execute(input(value, BookingOperation.CHECK_IN))).rejects.toThrow('forced operations audit failure');
      expect(await prisma.booking.findUnique({ where: { id: value.booking.id } })).toEqual(value.booking);
      expect(await prisma.bookingTimelineEvent.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_operations_test_audit_trigger ON "BookingTimelineEvent"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_operations_test_audit()');
    }
  });
});
