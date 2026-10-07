import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceRecognitionSourceReport } from '../../src/modules/finance/application/finance-recognition.operations';
import type { FinanceCloseSnapshot, FinanceCloseSources } from '../../src/modules/finance/domain/finance-close.types';
import type { FinanceClosePackage } from '../../src/modules/finance/application/finance-close.package';
import type { CertifyServiceCommand, ServiceCertificate } from '../../src/modules/finance/domain/finance-recognition.types';
import type { FinanceBookingResult } from '../../src/modules/finance/domain/finance-booking-result.types';
import { closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';

const september = { from: '2026-09-01', to: '2026-10-01' };
const october = { from: '2026-10-01', to: '2026-11-01' };
const nights = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
const acknowledgements = Object.fromEntries(['RECOGNITION_COVERAGE', 'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS'].map(key => [key, 'OWNER reconoce la excepción sintética visible del checklist.']));

describe('Recognition y cierre HTTP: AppModule, JWT y PostgreSQL reales', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FinanceFixture;
  let ownerToken: string;
  const endpoint = (businessId = fixture.business.id) => `/api/businesses/${businessId}/finance`;
  const get = (path: string, token = ownerToken, businessId = fixture.business.id) => request(app.getHttpServer()).get(`${endpoint(businessId)}/${path}`).set('Authorization', `Bearer ${token}`);
  const post = (path: string, body: object, key: string = randomUUID(), token = ownerToken, businessId = fixture.business.id) => request(app.getHttpServer()).post(`${endpoint(businessId)}/${path}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);

  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); ownerToken = await realFinanceToken(app, fixture.users.OWNER.id); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  async function service(complete = true, foreign = false) {
    const actor = foreign ? fixture.foreignActor : fixture.actor;
    const resourceId = foreign ? fixture.foreignResource.id : fixture.resource.id;
    const token = foreign ? await realFinanceToken(app, actor.actorUserId) : ownerToken;
    const booking = await prisma.booking.create({ data: { businessId: actor.businessId, status: 'CONFIRMED', checkInDate: new Date('2026-09-29'), checkOutDate: new Date('2026-10-03'), adults: 1, children: 0, resources: { create: { resourceId } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1200000, items: [{ resourceId, pricingMode: 'CALCULATED', agreedAmountMinor: 1200000, suggestedAmountMinor: 1200000, adjustmentAmountMinor: 0, overrideReason: null, nights: 4, breakdown: nights.map(date => ({ date, amountMinor: 300000 })) }] } });
    const operation = (path: string, expectedUpdatedAt: string) => request(app.getHttpServer()).post(`/api/businesses/${actor.businessId}/bookings/${booking.id}/${path}`).set('Authorization', `Bearer ${token}`).send({ expectedUpdatedAt, reason: 'Operación manual observada en fixture HTTP.' });
    const checkIn = await operation('check-in', booking.updatedAt.toISOString()).expect(200);
    if (complete) await operation('check-out', checkIn.body.updatedAt as string).expect(200);
    return { booking: await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }), snapshot };
  }
  async function sources(): Promise<FinanceRecognitionSourceReport> {
    const response = await get('recognition-sources').query({ from: september.from, to: october.to }).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    return response.body as FinanceRecognitionSourceReport;
  }
  async function command(bookingId: string, servedNights = nights, effectiveCheckOutOn: string | null = '2026-10-03'): Promise<CertifyServiceCommand> {
    const source = (await sources()).sources.find(row => row.bookingId === bookingId)!;
    return { bookingId, expectedBookingUpdatedAt: source.bookingUpdatedAt, expectedCertificateVersion: source.currentCertificate?.version ?? 0, expectedPricingSourceId: source.pricing!.sourceId, servedNights, effectiveCheckInOn: '2026-09-29', effectiveCheckOutOn, evidence: 'Noches observadas en registro manual del huésped.', reason: 'OWNER certifica explícitamente el servicio.', supersedesCertificateId: source.currentCertificate?.id ?? null };
  }
  async function createClose() {
    const period = await post('periods', { ...september, reason: 'Mes terminado.' }).expect(200);
    const prepared = (await get(`periods/${period.body.id}/prepare`).expect(200)).body as FinanceCloseSources;
    const closed = await post(`periods/${period.body.id}/close`, { expectedVersion: period.body.version, expectedSourceToken: prepared.sourceToken, reason: 'OWNER cierra con excepciones visibles.', acknowledgements }).expect(200);
    return { periodId: period.body.id as string, periodVersion: closed.body.period.version as number, snapshot: closed.body.snapshot as FinanceCloseSnapshot };
  }

  it('fuente tipada y selección manual → Golden A600000/600000; retry perdido no duplica y versiones obsoletas409', async () => {
    const value = await service();
    const source = (await sources()).sources.find(row => row.bookingId === value.booking.id)!;
    expect(source).toMatchObject({ pricing: { sourceId: value.snapshot.id }, currentCertificate: null, eligibleNights: nights, certificationBlockers: [] });
    expect(source.checkInEventId).toBeTruthy(); expect(source.checkOutEventId).toBeTruthy();
    const body = await command(value.booking.id); const key = randomUUID();
    const first = await post('service-certificates', body, key).expect(200);
    const certificate = first.body as ServiceCertificate;
    expect(first.headers['cache-control']).toBe('no-store');
    expect(certificate).toMatchObject({ businessId: fixture.business.id, recordedByUserId: fixture.users.OWNER.id, version: 1 });
    const retry = await post('service-certificates', body, key).expect(200); expect(retry.body).toEqual(first.body);
    for (const period of [september, october]) {
      const result = await get('profitability').query(period).expect(200);
      expect(result.body.totals).toMatchObject({ serviceRevenueMinor: 600000, terminalRevenueMinor: 0 });
      expect(result.body.units).toHaveLength(2);
    }
    await post('service-certificates', body).expect(409);
    expect(await prisma.financeServiceCertificate.count()).toBe(1); expect(await prisma.financeServiceUnit.count()).toBe(4);
    expect(await prisma.financeAudit.count({ where: { sourceId: certificate.id } })).toBe(1);
  });

  it('tramo IN_PROGRESS sin checkout permite noches pasadas explícitas y muestra hueco sin inventar unidades', async () => {
    const value = await service(false);
    await post('service-certificates', await command(value.booking.id, ['2026-09-29'], null)).expect(200);
    const result = await get('profitability').query(september).expect(200);
    expect(result.body.totals).toMatchObject({ serviceRevenueMinor: 300000, marginBasisPoints: null });
    expect(result.body.coverage).toMatchObject({ complete: false, pendingByReason: { SERVICE_NIGHT_NOT_CERTIFIED: 1 } });
    expect(result.body.pendingServiceNights).toEqual([expect.objectContaining({ bookingId: value.booking.id, localNight: '2026-09-30', sourceVersion: '1' })]);
    expect(await prisma.financeServiceUnit.count()).toBe(1);
    const source = (await sources()).sources.find(row => row.bookingId === value.booking.id)!;
    expect(source.checkOutEventId).toBeNull(); expect(source.currentCertificate!.effectiveCheckOutOn).toBeNull();
  });

  it('FIN022 resultado tipado reconoce Golden A por reserva, normaliza cut UTC y bloquea token/futuro/JSON extra', async () => {
    const value = await service(); const path = `bookings/${value.booking.id}/result`;
    const pending = await get(path).query(september).expect(200);
    expect(pending.body).toMatchObject({ revenueMinor: 0, contributionMinor: null, coverage: { complete: false } });
    await post('service-certificates', await command(value.booking.id)).expect(200);
    const response = await get(path).query(september).expect(200); const result = response.body as FinanceBookingResult;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(result).toMatchObject({ bookingId: value.booking.id, resourceId: fixture.resource.id, scope: 'DIRECT_BOOKING_COSTS_ONLY', revenueMinor: 600000, contributionMinor: 600000, contributionMarginBasisPoints: 10000 });
    expect((await get(path).query({ ...september, asOf: result.asOf, token: result.token }).expect(200)).body.token).toBe(result.token);
    await get(path).query({ ...september, token: '0'.repeat(64) }).expect(409);
    await get(path).query({ ...september, asOf: new Date(Date.now() + 60000).toISOString() }).expect(400);
    await get(path).query({ ...september, asOf: '2026-02-30T10:00:00Z' }).expect(400);
    await get(path).query({ ...september, actorUserId: fixture.foreignOwner.id }).expect(400);
    expect(await prisma.financeServiceUnit.count()).toBe(4);
  });

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const)('%s no puede ver, certificar, reconocer, cerrar/reabrir ni exportar nuevas capacidades', async role => {
    const value = await service(); const body = await command(value.booking.id); const closed = await createClose();
    const token = await realFinanceToken(app, fixture.users[role].id);
    for (const path of ['recognition-sources', 'profitability', `bookings/${value.booking.id}/result`]) await get(path, token).query(september).expect(403);
    for (const path of ['periods', `periods/${closed.periodId}/prepare`, `periods/${closed.periodId}/snapshot`, `periods/${closed.periodId}/package`]) await get(path, token).expect(403);
    await post('service-certificates', body, randomUUID(), token).expect(403);
    await post('terminal-recognitions', {}, randomUUID(), token).expect(403);
    await post(`periods/${closed.periodId}/close`, {}, randomUUID(), token).expect(403);
    await post(`periods/${closed.periodId}/reopen`, { expectedVersion: closed.periodVersion, reason: 'Intento sin OWNER.' }, randomUUID(), token).expect(403);
    expect(await prisma.financeServiceCertificate.count()).toBe(0);
  });

  it('otro tenant e ID inexistente devuelven404 indistinguible sin datos; también al tener OWNER en ambos', async () => {
    const own = await service(); const foreign = await service(true, true);
    await prisma.userBusinessMembership.create({ data: { userId: fixture.users.OWNER.id, businessId: fixture.foreignBusiness.id, role: 'OWNER' } });
    const body = await command(own.booking.id);
    const missing = await post('service-certificates', { ...body, bookingId: randomUUID() }).expect(404);
    const inaccessible = await post('service-certificates', { ...body, bookingId: foreign.booking.id }).expect(404);
    expect(inaccessible.body).toEqual(missing.body); expect(JSON.stringify(inaccessible.body)).not.toContain(foreign.booking.id);
    const bookingUnknown = await get(`bookings/${randomUUID()}/result`).query(september).expect(404);
    const bookingForeign = await get(`bookings/${foreign.booking.id}/result`).query(september).expect(404);
    expect(bookingForeign.body).toEqual(bookingUnknown.body); expect(JSON.stringify(bookingForeign.body)).not.toContain(foreign.booking.id);
    const foreignPeriod = await post('periods', { ...september, reason: 'Periodo ajeno.' }, randomUUID(), ownerToken, fixture.foreignBusiness.id).expect(200);
    const hidden = await get(`periods/${foreignPeriod.body.id}/snapshot`).expect(404);
    const unknown = await get(`periods/${randomUUID()}/snapshot`).expect(404);
    expect(hidden.body).toEqual(unknown.body);
    expect((await sources()).sources.some(row => row.bookingId === foreign.booking.id)).toBe(false);
    expect(await prisma.financeServiceCertificate.count()).toBe(0);
  });

  it('JWT ausente/usuario deshabilitado y membresía revocada con token existente no leen ni escriben', async () => {
    const value = await service(); const body = await command(value.booking.id);
    await request(app.getHttpServer()).get(`${endpoint()}/recognition-sources`).query(september).expect(401);
    await prisma.userBusinessMembership.delete({ where: { userId_businessId: { userId: fixture.users.OWNER.id, businessId: fixture.business.id } } });
    await get('recognition-sources').query(september).expect(403);
    await get(`bookings/${value.booking.id}/result`).query(september).expect(403);
    await post('service-certificates', body).expect(403);
    await prisma.user.update({ where: { id: fixture.users.OWNER.id }, data: { status: 'DISABLED' } });
    await get('profitability').query(september).expect(401);
    expect(await prisma.financeServiceCertificate.count()).toBe(0); expect(await prisma.financeRequest.count()).toBe(0);
  });

  it('validación estricta no admite actor/precios inyectados, pesos/noche duplicada o token obsoleto', async () => {
    const value = await service(); const body = await command(value.booking.id);
    for (const invalid of [{ ...body, recordedByUserId: fixture.foreignOwner.id }, { ...body, amountMinor: 1 }, { ...body, servedNights: [nights[0], nights[0]] }, { ...body, effectiveCheckOutOn: '2026-02-30' }]) await post('service-certificates', invalid).expect(400);
    await get('recognition-sources').query({ ...september, token: '0'.repeat(64) }).expect(409);
    expect(await prisma.financeServiceCertificate.count()).toBe(0); expect(await prisma.financeRequest.count()).toBe(0);
  });

  it('cierre409 para escritura retroactiva no deja filas; reapertura OWNER conserva paquete anterior idéntico y crea nueva versión', async () => {
    const value = await service(); await post('service-certificates', await command(value.booking.id)).expect(200);
    const closed = await createClose(); const packagePath = `periods/${closed.periodId}/package`;
    const original = (await get(packagePath).query({ snapshotId: closed.snapshot.id }).expect(200)).body as FinanceClosePackage;
    expect(original.snapshot.payloadHash).toBe(closed.snapshot.payloadHash); expect(original.detailsCsv).toContain(closed.snapshot.sourceToken);
    const beforeRequests = await prisma.financeRequest.count(); const beforeAudits = await prisma.financeAudit.count();
    await post('commands', { ...expenseCommand(fixture, 10000), dueOn: null }).expect(409);
    expect(await prisma.financeExpense.count()).toBe(0); expect(await prisma.financeRequest.count()).toBe(beforeRequests); expect(await prisma.financeAudit.count()).toBe(beforeAudits);
    await post(`periods/${closed.periodId}/reopen`, { expectedVersion: closed.periodVersion - 1, reason: 'Versión obsoleta.' }).expect(409);
    const reopened = await post(`periods/${closed.periodId}/reopen`, { expectedVersion: closed.periodVersion, reason: 'OWNER solicita corrección con motivo auditable.' }).expect(200);
    expect(reopened.body.period).toMatchObject({ status: 'OPEN', version: 3, latestSnapshotId: closed.snapshot.id });
    expect((await get(packagePath).query({ snapshotId: closed.snapshot.id }).expect(200)).body).toEqual(original);
    const prepared = (await get(`periods/${closed.periodId}/prepare`).expect(200)).body as FinanceCloseSources;
    const reclosed = await post(`periods/${closed.periodId}/close`, { expectedVersion: 3, expectedSourceToken: prepared.sourceToken, reason: 'Segundo cierre después de revisión.', acknowledgements }).expect(200);
    expect(reclosed.body.snapshot).toMatchObject({ previousSnapshotId: closed.snapshot.id, closeVersion: 4 });
    expect((await get(packagePath).query({ snapshotId: closed.snapshot.id }).expect(200)).body).toEqual(original);
    expect(await prisma.financeCloseSnapshot.count()).toBe(2); expect(await prisma.financeCloseEvent.count()).toBe(3);
  });
});
