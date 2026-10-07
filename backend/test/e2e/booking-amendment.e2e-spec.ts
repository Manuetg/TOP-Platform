import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import type { BookingAmendmentPreview } from '../../src/modules/booking-lifecycle/booking-amendment.contract';
import { assertTestDatabase, cleanTestDatabase } from '../integration/support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
const secret = 'booking-amendment-e2e-synthetic-secret';

describeWithPostgres('Edición de reservas y precio vigente: HTTP real', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let businessId: string; let otherBusinessId: string; let actorId: string; let contactId: string; let resourceId: string; let ratePlanId: string; let token: string;
  beforeAll(async () => {
    assertTestDatabase(databaseUrl);
    if (process.env.TEST_DATABASE_URL !== databaseUrl) throw new Error('La base sintética declarada debe coincidir con DATABASE_URL.');
    await prisma.$connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JwtAccessTokenIssuer).useFactory({ factory: () => new JwtAccessTokenIssuer(new JwtService(), new ConfigService({ JWT_ACCESS_SECRET: secret })) }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
  });
  beforeEach(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    businessId = (await prisma.business.create({ data: { name: 'Amendment HTTP', currency: 'PYG', timezone: 'America/Asuncion' } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: 'Other amendment HTTP' } })).id;
    actorId = (await prisma.user.create({ data: { email: 'amendment-http@example.invalid', emailVerifiedAt: new Date() } })).id;
    await prisma.userBusinessMembership.create({ data: { userId: actorId, businessId, role: 'OWNER' } });
    contactId = (await prisma.contact.create({ data: { businessId, name: 'Contacto QA' } })).id;
    resourceId = (await prisma.resource.create({ data: { businessId, name: 'Recurso QA', internalCode: 'AMENDMENT-QA', capacityMaximum: 4, capacityMaximumChildren: 2 } })).id;
    ratePlanId = (await prisma.ratePlan.create({ data: { businessId, name: 'Tarifa QA', baseNightlyAmountMinor: 50, resources: { create: { resourceId } } } })).id;
    token = await new JwtService().signAsync({ sub: actorId }, { secret, expiresIn: 900 });
  });
  afterEach(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS amendment_audit_failure ON "BookingTimelineEvent"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS amendment_audit_failure()');
    await cleanTestDatabase(prisma, databaseUrl);
  });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  const base = () => '/api/businesses/' + businessId + '/bookings';
  const pricing = (total: number) => [{ resourceId, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: total, overrideReason: 'Acuerdo real de QA' }];
  const pendingBody = (total = 100) => ({ contactId, resourceIds: [resourceId], checkInDate: '2026-12-10', checkOutDate: '2026-12-12', adults: 2, children: 0, pricing: pricing(total) });
  async function pending(total = 100): Promise<string> {
    const response = await request(app.getHttpServer()).post(base() + '/pending').set('Authorization', 'Bearer ' + token).send(pendingBody(total)).expect(201);
    return (response.body as { id: string }).id;
  }
  async function preview(bookingId: string, changes: object): Promise<BookingAmendmentPreview> {
    const response = await request(app.getHttpServer()).post(base() + '/' + bookingId + '/amendment-preview').set('Authorization', 'Bearer ' + token).send(changes).expect(200);
    return response.body as BookingAmendmentPreview;
  }
  function accepted(changes: object, value: BookingAmendmentPreview) {
    return { ...changes, expectedUpdatedAt: value.expectedUpdatedAt, currentPricingId: value.currentPricingId, expectedPaidAmountMinor: value.expectedPaidAmountMinor, expectedFinancialVersion: value.expectedFinancialVersion, acceptedQuote: value.quote };
  }
  function save(bookingId: string, body: object) { return request(app.getHttpServer()).patch(base() + '/' + bookingId + '/amendment').set('Authorization', 'Bearer ' + token).send(body); }
  function payment(bookingId: string, amountMinor: number, key: string) { return request(app.getHttpServer()).post(base() + '/' + bookingId + '/payments').set('Authorization', 'Bearer ' + token).set('Idempotency-Key', key).send({ amountMinor, method: 'CASH', paidAt: '2000-01-01T12:00:00.000Z' }); }

  it('preview no escribe reserva, Snapshot, revisión, dinero o timeline', async () => {
    const id = await pending();
    const before = await prisma.booking.findUniqueOrThrow({ where: { id } });
    const result = await preview(id, { checkOutDate: '2026-12-13', pricing: pricing(80), reason: 'Cambio solicitado' });
    expect(result).toMatchObject({ bookingId: id, status: 'PENDING', expectedPaidAmountMinor: 0, quote: { currency: 'PYG', totalAmountMinor: 80 }, financialSummary: { outstandingAmountMinor: 80, creditAmountMinor: 0 } });
    expect(await prisma.booking.findUnique({ where: { id } })).toEqual(before);
    expect(await prisma.pricingRevision.count()).toBe(0); expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.bookingTimelineEvent.count()).toBe(2);
  });

  it('permite a Reception cambiar contacto/notas sin tocar Snapshot manual ni fabricar un motivo', async () => {
    const id = await pending(); const original = await prisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: id } });
    const newContact = await prisma.contact.create({ data: { businessId, name: 'Otro contacto QA' } });
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: actorId, businessId } }, data: { role: 'RECEPTIONIST' } });
    const changes = { contactId: newContact.id, notes: '  Actualización real  ', adults: 1 };
    const quoted = await preview(id, changes); expect(quoted.quote.items).toEqual(original.items);
    await save(id, accepted(changes, quoted)).expect(200);
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: id } })).toEqual(original);
    expect(await prisma.pricingRevision.count()).toBe(0);
    const event = await prisma.bookingTimelineEvent.findFirstOrThrow({ where: { bookingId: id, type: 'BOOKING_AMENDED' } });
    expect(event.actorUserId).toBe(actorId); expect(event.details).toMatchObject({ before: { contactId }, after: { contactId: newContact.id, notes: 'Actualización real' }, pricingRevisionId: null });
    expect(event.details).not.toHaveProperty('reason');
  });

  it('una rebaja conserva cobros/Snapshot, muestra crédito y audita actor/motivo/precio anterior', async () => {
    const id = await pending(); await payment(id, 90, 'credit-original').expect(201);
    const original = await prisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: id } });
    const payments = await prisma.payment.findMany({ where: { bookingId: id } });
    const changes = { checkOutDate: '2026-12-13', pricing: pricing(80), reason: 'Estadía ajustada' };
    const quoted = await preview(id, changes); expect(quoted.financialSummary).toEqual({ totalAmountMinor: 80, paidAmountMinor: 90, grossRecordedAmountMinor: 90, voidedAmountMinor: 0, refundedAmountMinor: 0, netRetainedAmountMinor: 90, financialVersion: 1, outstandingAmountMinor: 0, creditAmountMinor: 10 }); expect(quoted.warnings).not.toHaveLength(0);
    await save(id, accepted(changes, quoted)).expect(200);
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: id } })).toEqual(original); expect(await prisma.payment.findMany({ where: { bookingId: id } })).toEqual(payments);
    expect(await prisma.pricingRevision.findFirst({ where: { bookingId: id } })).toMatchObject({ revisionNumber: 1, originalSnapshotId: original.id, actorUserId: actorId, reason: changes.reason, totalAmountMinor: 80n, paidAmountMinorAtSave: 90n });
    const detail = await request(app.getHttpServer()).get(base() + '/' + id).set('Authorization', 'Bearer ' + token).expect(200);
    expect(detail.body as object).toMatchObject({ status: 'CONFIRMED', financialSummary: { totalAmountMinor: 80, paidAmountMinor: 90, creditAmountMinor: 10 } });
    const balance = await request(app.getHttpServer()).get(base() + '/' + id + '/outstanding-balance').set('Authorization', 'Bearer ' + token).expect(200);
    expect(balance.body as object).toMatchObject({ creditAmountMinor: 10, outstandingAmountMinor: 0, needsReconciliation: true });
    await payment(id, 1, 'credit-additional').expect(409);
    const timeline = await request(app.getHttpServer()).get(base() + '/' + id + '/timeline').set('Authorization', 'Bearer ' + token).expect(200);
    expect((timeline.body as { items: { type: string; details: object }[] }).items.find(({ type }) => type === 'BOOKING_AMENDED')).toMatchObject({ details: { reason: changes.reason, previousTotalAmountMinor: 100, totalAmountMinor: 80 } });
  });

  it('requiere precio explícito para fechas y permite cálculo configurado a Reception', async () => {
    const id = await pending();
    await request(app.getHttpServer()).post(base() + '/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ checkOutDate: '2026-12-13' }).expect(400);
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: actorId, businessId } }, data: { role: 'RECEPTIONIST' } });
    const changes = { checkOutDate: '2026-12-13', pricing: [{ resourceId, ratePlanId }] };
    const quoted = await preview(id, changes); expect(quoted.quote.totalAmountMinor).toBe(150);
    await save(id, accepted(changes, quoted)).expect(200); expect(await prisma.pricingRevision.count()).toBe(1);
  });

  it('rechaza actor no autenticado, Viewer, manual Reception y tenant ajeno', async () => {
    const id = await pending(); const url = base() + '/' + id + '/amendment-preview';
    await request(app.getHttpServer()).post(url).send({ notes: 'Cambio' }).expect(401);
    for (const role of ['VIEWER', 'RECEPTIONIST'] as const) {
      await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: actorId, businessId } }, data: { role } });
      await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer ' + token).send({ pricing: pricing(80) }).expect(403);
    }
    await request(app.getHttpServer()).post('/api/businesses/' + otherBusinessId + '/bookings/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ notes: 'Cambio' }).expect(403);
    expect(await prisma.pricingRevision.count()).toBe(0);
  });

  it.each(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)('no amplía la edición a %s', async (status) => {
    const id = await pending(); await prisma.booking.update({ where: { id }, data: { status } });
    await request(app.getHttpServer()).post(base() + '/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ notes: 'Cambio' }).expect(409);
    expect(await prisma.pricingRevision.count()).toBe(0);
  });

  it('rechaza disponibilidad/contacto/capacidad inválidos sin cambios parciales', async () => {
    const id = await pending();
    const foreignContact = await prisma.contact.create({ data: { businessId: otherBusinessId, name: 'Contacto ajeno' } });
    await request(app.getHttpServer()).post(base() + '/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ contactId: foreignContact.id }).expect(409);
    await request(app.getHttpServer()).post(base() + '/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ adults: 10 }).expect(400);
    await prisma.block.create({ data: { businessId, resourceId, type: 'MAINTENANCE', reason: 'Bloqueo QA', startsAt: new Date('2026-12-12'), endsAt: new Date('2026-12-14') } });
    await request(app.getHttpServer()).post(base() + '/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ checkOutDate: '2026-12-13', pricing: pricing(80) }).expect(409);
    expect(await prisma.pricingRevision.count()).toBe(0); expect(await prisma.bookingTimelineEvent.count({ where: { type: 'BOOKING_AMENDED' } })).toBe(0);
  });

  it('una tarifa cambiada o quote manipulado obliga a repetir preview', async () => {
    const id = await pending(); const changes = { pricing: [{ resourceId, ratePlanId }] }; const quoted = await preview(id, changes);
    await prisma.ratePlan.update({ where: { id: ratePlanId }, data: { baseNightlyAmountMinor: 60 } });
    await save(id, accepted(changes, quoted)).expect(409);
    const current = await preview(id, changes);
    await save(id, { ...accepted(changes, current), acceptedQuote: { ...current.quote, totalAmountMinor: 1 } }).expect(409);
    expect(await prisma.pricingRevision.count()).toBe(0);
  });

  it('rechaza convertir moneda y conserva el precio histórico al editar sólo notas', async () => {
    const id = await pending(); await prisma.business.update({ where: { id: businessId }, data: { currency: 'USD' } });
    await request(app.getHttpServer()).post(base() + '/' + id + '/amendment-preview').set('Authorization', 'Bearer ' + token).send({ pricing: pricing(80) }).expect(409);
    const changes = { notes: 'Sin conversión' }; const quoted = await preview(id, changes); expect(quoted.quote.currency).toBe('PYG'); await save(id, accepted(changes, quoted)).expect(200);
    expect(await prisma.pricingRevision.count()).toBe(0);
  });

  it('versiones/precio/cobros obsoletos y edición paralela producen409', async () => {
    const id = await pending(); const firstChanges = { notes: 'Primera versión' }; const secondChanges = { notes: 'Segunda versión' };
    const first = await preview(id, firstChanges); const second = await preview(id, secondChanges);
    await save(id, { ...accepted(firstChanges, first), expectedPaidAmountMinor: 1 }).expect(409);
    const outcomes = await Promise.all([save(id, accepted(firstChanges, first)), save(id, accepted(secondChanges, second))]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.bookingTimelineEvent.count({ where: { type: 'BOOKING_AMENDED' } })).toBe(1);
  });

  it('pago concurrente y rebaja usan el total canónico sin sobrepago ni confirmación falsa', async () => {
    const id = await pending(); const changes = { pricing: pricing(75) }; const quoted = await preview(id, changes);
    const [edit, paid] = await Promise.all([save(id, accepted(changes, quoted)), payment(id, 80, 'race-reprice')]);
    expect([[200, 409], [409, 201]]).toContainEqual([edit.status, paid.status]);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(booking.status).toBe(paid.status === 201 ? 'CONFIRMED' : 'PENDING');
    expect(await prisma.payment.count()).toBe(paid.status === 201 ? 1 : 0);
    expect(await prisma.pricingRevision.count()).toBe(edit.status === 200 ? 1 : 0);
  });

  it.each([0, -120000])('la versión metadata-only siempre avanza con reloj desplazado %p y rechaza previews antiguos', async (clockOffset) => {
    const id = await pending();
    const observedTime = Date.now() + 60000;
    await prisma.booking.update({ where: { id }, data: { updatedAt: new Date(observedTime) } });
    const changes = { notes: 'Cambio operativo sin revisión financiera' };
    const quoted = await preview(id, changes);
    const oldOtherChanges = { notes: 'Preview anterior de otro cliente' };
    const oldOtherQuote = await preview(id, oldOtherChanges);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(observedTime + clockOffset);
    try {
      const first = await save(id, accepted(changes, quoted)).expect(200);
      expect(Date.parse((first.body as { updatedAt: string }).updatedAt)).toBe(observedTime + 1);
      await save(id, accepted(oldOtherChanges, oldOtherQuote)).expect(409);
      const nextChanges = { notes: 'Otra modificación en el mismo instante' };
      const nextQuote = await preview(id, nextChanges);
      const second = await save(id, accepted(nextChanges, nextQuote)).expect(200);
      expect(Date.parse((second.body as { updatedAt: string }).updatedAt)).toBe(observedTime + 2);
      await save(id, accepted(changes, quoted)).expect(409);
      expect(await prisma.pricingRevision.count()).toBe(0);
      expect(await prisma.bookingTimelineEvent.count({ where: { type: 'BOOKING_AMENDED' } })).toBe(2);
    } finally { clock.mockRestore(); }
  });

  it('cancelación concurrente nunca reabre la reserva', async () => {
    const id = await pending(); const changes = { pricing: pricing(80) }; const quoted = await preview(id, changes);
    const [edit, cancelled] = await Promise.all([save(id, accepted(changes, quoted)), request(app.getHttpServer()).post(base() + '/' + id + '/cancel').set('Authorization', 'Bearer ' + token).send({ reason: 'Cancelación solicitada en QA' })]);
    expect([200, 409]).toContain(edit.status); expect(cancelled.status).toBe(200);
    expect(await prisma.booking.findUnique({ where: { id } })).toMatchObject({ status: 'CANCELLED' }); expect(await prisma.payment.count()).toBe(0);
  });

  it('falla de auditoría revierte Booking y PricingRevision y protege historia append-only', async () => {
    const id = await pending(); const original = await prisma.booking.findUniqueOrThrow({ where: { id } }); const changes = { pricing: pricing(80), notes: 'Cambio atómico' }; const quoted = await preview(id, changes);
    await prisma.$executeRawUnsafe("CREATE FUNCTION amendment_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic amendment audit failure'; END $$");
    await prisma.$executeRawUnsafe("CREATE TRIGGER amendment_audit_failure BEFORE INSERT ON \"BookingTimelineEvent\" FOR EACH ROW WHEN (NEW.type = 'BOOKING_AMENDED') EXECUTE FUNCTION amendment_audit_failure()");
    await save(id, accepted(changes, quoted)).expect(500);
    expect(await prisma.booking.findUnique({ where: { id } })).toEqual(original); expect(await prisma.pricingRevision.count()).toBe(0);
    await prisma.$executeRawUnsafe('DROP TRIGGER amendment_audit_failure ON "BookingTimelineEvent"'); await prisma.$executeRawUnsafe('DROP FUNCTION amendment_audit_failure()');
    await save(id, accepted(changes, quoted)).expect(200);
    const revision = await prisma.pricingRevision.findFirstOrThrow({ where: { bookingId: id } });
    await expect(prisma.pricingRevision.update({ where: { id: revision.id }, data: { totalAmountMinor: 1 } })).rejects.toThrow();
    await expect(prisma.pricingRevision.delete({ where: { id: revision.id } })).rejects.toThrow();
  });

  it('preview advierte plan obsoleto y conserva sus cuotas/aplicaciones', async () => {
    const id = await pending(); await payment(id, 40, 'planned-payment').expect(201);
    await request(app.getHttpServer()).post(base() + '/' + id + '/payment-plan').set('Authorization', 'Bearer ' + token).send({ installments: [{ amountMinor: 100, dueDate: '2026-12-10' }] }).expect(201);
    const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { bookingId: id }, include: { installments: { include: { applications: true } } } });
    const changes = { pricing: pricing(80) }; const quoted = await preview(id, changes); expect(quoted.warnings.some((warning) => warning.includes('conciliación'))).toBe(true);
    await save(id, accepted(changes, quoted)).expect(200);
    expect(await prisma.paymentPlan.findUnique({ where: { bookingId: id }, include: { installments: { include: { applications: true } } } })).toEqual(plan);
  });
});
