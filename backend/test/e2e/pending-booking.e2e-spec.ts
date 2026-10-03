import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { JwtAccessTokenIssuer } from '../../src/modules/identity/infrastructure/jwt-access-token-issuer';
import { assertTestDatabase, cleanTestDatabase } from '../integration/support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
const secret = 'pending-booking-e2e-synthetic-secret';
interface BookingBody { id: string; status: string; financialSummary?: { totalAmountMinor: number | null; paidAmountMinor: number; currency: string | null }; }
interface Fixture { businessId: string; otherBusinessId: string; contactId: string; resourceId: string; ratePlanId: string; actorId: string; }

describeWithPostgres('Alta pendiente y confirmación por cobro: HTTP real', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let value: Fixture;
  let token: string;
  let safeToClean = false;
  beforeAll(async () => {
    assertTestDatabase(databaseUrl);
    if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== databaseUrl) throw new Error('La base de pruebas debe coincidir con DATABASE_URL.');
    safeToClean = true;
    await prisma.$connect();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JwtAccessTokenIssuer)
      .useFactory({ factory: () => new JwtAccessTokenIssuer(new JwtService(), new ConfigService({ JWT_ACCESS_SECRET: secret })) })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });
  beforeEach(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    const business = await prisma.business.create({ data: { name: 'Pending HTTP', timezone: 'America/Asuncion', currency: 'PYG' } });
    const otherBusiness = await prisma.business.create({ data: { name: 'Other Pending HTTP' } });
    const actor = await prisma.user.create({ data: { email: 'pending-http@example.invalid', emailVerifiedAt: new Date() } });
    await prisma.userBusinessMembership.create({ data: { userId: actor.id, businessId: business.id, role: 'OWNER' } });
    const contact = await prisma.contact.create({ data: { businessId: business.id, name: 'Contacto QA', phone: '0991234567' } });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Recurso QA', internalCode: 'HTTP-QA', capacityMaximum: 4, capacityMaximumChildren: 2 } });
    const ratePlan = await prisma.ratePlan.create({ data: { businessId: business.id, name: 'Tarifa QA', baseNightlyAmountMinor: 15000, resources: { create: { resourceId: resource.id } } } });
    value = { businessId: business.id, otherBusinessId: otherBusiness.id, contactId: contact.id, resourceId: resource.id, ratePlanId: ratePlan.id, actorId: actor.id };
    token = await new JwtService().signAsync({ sub: actor.id }, { secret, expiresIn: 900 });
  });
  afterEach(async () => { if (safeToClean) await cleanTestDatabase(prisma, databaseUrl); });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  function bookingInput(totalAmountMinor = 50000) {
    return { contactId: value.contactId, resourceIds: [value.resourceId], checkInDate: '2026-06-10', checkOutDate: '2026-06-12', adults: 2, children: 0,
      pricing: [{ resourceId: value.resourceId, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: totalAmountMinor, overrideReason: 'Acuerdo de QA' }] };
  }
  async function createPending(totalAmountMinor = 50000): Promise<BookingBody> {
    const response = await request(app.getHttpServer()).post('/api/businesses/' + value.businessId + '/bookings/pending')
      .set('Authorization', 'Bearer ' + token).send(bookingInput(totalAmountMinor)).expect(201);
    return response.body as BookingBody;
  }

  it('crea directamente PENDING con contacto, fechas, precio y auditoría, sin DRAFT ni CONFIRMED intermedios', async () => {
    const created = await createPending();
    expect(created.status).toBe('PENDING');
    expect(await prisma.booking.findUnique({ where: { id: created.id } })).toMatchObject({ status: 'PENDING', contactId: value.contactId });
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: created.id } })).toMatchObject({ totalAmountMinor: 50000n, currency: 'PYG' });
    const events = await prisma.bookingTimelineEvent.findMany({ where: { bookingId: created.id }, orderBy: { type: 'asc' } });
    expect(events.map(({ type }) => type)).toEqual(['BOOKING_CREATED', 'BOOKING_SUBMITTED']);
    expect(events.every(({ actorUserId }) => actorUserId === value.actorId)).toBe(true);
  });

  it('permite precio configurado a recepción y conserva el cálculo backend', async () => {
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: value.actorId, businessId: value.businessId } }, data: { role: 'RECEPTIONIST' } });
    const input = { ...bookingInput(), pricing: [{ resourceId: value.resourceId, ratePlanId: value.ratePlanId }] };
    const response = await request(app.getHttpServer()).post('/api/businesses/' + value.businessId + '/bookings/pending').set('Authorization', 'Bearer ' + token).send(input).expect(201);
    const created = response.body as BookingBody;
    expect(created.status).toBe('PENDING');
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: created.id } })).toMatchObject({ totalAmountMinor: 30000n });
  });

  it('rechaza falta de autenticación, VIEWER, precio manual de recepción y negocio ajeno sin crear datos', async () => {
    const url = '/api/businesses/' + value.businessId + '/bookings/pending';
    await request(app.getHttpServer()).post(url).send(bookingInput()).expect(401);
    for (const role of ['VIEWER', 'RECEPTIONIST'] as const) {
      await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: value.actorId, businessId: value.businessId } }, data: { role } });
      await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer ' + token).send(bookingInput()).expect(403);
    }
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: value.actorId, businessId: value.businessId } }, data: { role: 'OWNER' } });
    await request(app.getHttpServer()).post('/api/businesses/' + value.otherBusinessId + '/bookings/pending').set('Authorization', 'Bearer ' + token).send(bookingInput()).expect(403);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('rechaza mínimos incompletos y precio inválido sin dejar reservas ni snapshots', async () => {
    const url = '/api/businesses/' + value.businessId + '/bookings/pending';
    const { contactId: omitted, ...missingContact } = bookingInput();
    void omitted;
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer ' + token).send(missingContact).expect(409);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer ' + token).send(bookingInput(-1)).expect(400);
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.pricingSnapshot.count()).toBe(0);
  });

  it('bloquea Confirm legacy de una nueva PENDING con precio y no altera el snapshot', async () => {
    const created = await createPending();
    const snapshot = await prisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: created.id } });
    await request(app.getHttpServer()).post('/api/businesses/' + value.businessId + '/bookings/' + created.id + '/confirm')
      .set('Authorization', 'Bearer ' + token).send({ pricing: bookingInput().pricing }).expect(409);
    expect(await prisma.booking.findUnique({ where: { id: created.id } })).toMatchObject({ status: 'PENDING' });
    expect(await prisma.pricingSnapshot.findUnique({ where: { bookingId: created.id } })).toEqual(snapshot);
    expect(await prisma.payment.count()).toBe(0);
  });

  it('pago positivo 1 confirma y lista/detalle exponen importes exactos sin internos', async () => {
    const created = await createPending(1000000);
    const url = '/api/businesses/' + value.businessId + '/bookings/' + created.id;
    await request(app.getHttpServer()).post(url + '/payments').set('Authorization', 'Bearer ' + token).set('Idempotency-Key', 'http-first-payment')
      .send({ amountMinor: 1, method: 'CASH', paidAt: '2000-01-01T12:00:00.000Z' }).expect(201);
    const detail = await request(app.getHttpServer()).get(url).set('Authorization', 'Bearer ' + token).expect(200);
    expect(detail.body as BookingBody).toMatchObject({ status: 'CONFIRMED', financialSummary: { totalAmountMinor: 1000000, paidAmountMinor: 1, currency: 'PYG' } });
    const list = await request(app.getHttpServer()).get('/api/businesses/' + value.businessId + '/bookings').set('Authorization', 'Bearer ' + token).expect(200);
    const rows = list.body as BookingBody[];
    expect(rows).toHaveLength(1);
    expect(rows[0].financialSummary).toEqual({ totalAmountMinor: 1000000, paidAmountMinor: 1, currency: 'PYG', outstandingAmountMinor: 999999, creditAmountMinor: 0 });
    expect(Object.keys(rows[0].financialSummary!).sort()).toEqual(['creditAmountMinor', 'currency', 'outstandingAmountMinor', 'paidAmountMinor', 'totalAmountMinor']);
    expect(await prisma.bookingTimelineEvent.count({ where: { bookingId: created.id, type: 'BOOKING_CONFIRMED' } })).toBe(1);
  });

  it('precio cero permanece pendiente y no acepta pago cero ni sobrepago positivo', async () => {
    const created = await createPending(0);
    const url = '/api/businesses/' + value.businessId + '/bookings/' + created.id;
    for (const [amountMinor, status] of [[0, 400], [1, 409]]) {
      await request(app.getHttpServer()).post(url + '/payments').set('Authorization', 'Bearer ' + token).set('Idempotency-Key', 'zero-' + amountMinor)
        .send({ amountMinor, method: 'CASH', paidAt: '2000-01-01T12:00:00.000Z' }).expect(status);
    }
    const detail = await request(app.getHttpServer()).get(url).set('Authorization', 'Bearer ' + token).expect(200);
    expect(detail.body as BookingBody).toMatchObject({ status: 'PENDING', financialSummary: { totalAmountMinor: 0, paidAmountMinor: 0, currency: 'PYG' } });
    expect(await prisma.payment.count()).toBe(0);
  });

  it('serializa dos altas conflictivas con Pending bloqueante y no deja una reserva parcial', async () => {
    const url = '/api/businesses/' + value.businessId + '/bookings/pending';
    const results = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(url).set('Authorization', 'Bearer ' + token).send(bookingInput())));
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.booking.count({ where: { status: 'PENDING' } })).toBe(1);
    expect(await prisma.pricingSnapshot.count()).toBe(1);
    expect(await prisma.bookingResource.count()).toBe(1);
    expect(await prisma.bookingTimelineEvent.count()).toBe(2);
  });

  it.each([true, false])('serializa Submit legado contra nueva alta, respetando pendingBlocksAvailability=%s', async (pendingBlocksAvailability) => {
    await prisma.availabilityRule.create({ data: { businessId: value.businessId, pendingBlocksAvailability, bufferBeforeDays: 0, bufferAfterDays: 0 } });
    const legacy = await prisma.booking.create({ data: { businessId: value.businessId, status: 'DRAFT', contactId: value.contactId, checkInDate: new Date('2026-06-10'), checkOutDate: new Date('2026-06-12'), resources: { create: { resourceId: value.resourceId } } } });
    const base = '/api/businesses/' + value.businessId + '/bookings';
    const results = await Promise.all([
      request(app.getHttpServer()).post(base + '/' + legacy.id + '/submit').set('Authorization', 'Bearer ' + token).send({}),
      request(app.getHttpServer()).post(base + '/pending').set('Authorization', 'Bearer ' + token).send(bookingInput()),
    ]);
    const successes = results.filter(({ status }) => status >= 200 && status < 300);
    expect(successes).toHaveLength(pendingBlocksAvailability ? 1 : 2);
    expect(await prisma.booking.count({ where: { status: 'PENDING' } })).toBe(pendingBlocksAvailability ? 1 : 2);
  });
});
