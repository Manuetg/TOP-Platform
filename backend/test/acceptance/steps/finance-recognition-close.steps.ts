import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import type { MembershipRole, PrismaClient } from '@prisma/client';
import request, { type Response } from 'supertest';
import type { FinanceRecognitionSourceReport } from '../../../src/modules/finance/application/finance-recognition.operations';
import type { FinanceClosePackage } from '../../../src/modules/finance/application/finance-close.package';
import { FINANCE_CLOSE_WRITERS } from '../../../src/modules/finance/domain/finance-close.rules';
import type { FinanceCloseSources, FinanceCloseSnapshot } from '../../../src/modules/finance/domain/finance-close.types';
import type { CertifyServiceCommand } from '../../../src/modules/finance/domain/finance-recognition.types';
import { expenseCommand, realFinanceToken, type FinanceFixture } from '../../fixtures/finance-fixture';
import { TopWorld } from '../support/world';

// @financeReal activa el harness real existente en finance-v1.steps; global hooks omite overrides.
interface RecognitionCloseWorld extends TopWorld {
  financePrisma: PrismaClient; financeFixture: FinanceFixture; financeToken: string;
  recBookingId: string; recSnapshotId: string; recCommand: CertifyServiceCommand; recKey: string;
  recResponses: Response[]; recPeriodId: string; recPeriodVersion: number; recSnapshot: FinanceCloseSnapshot;
  recOriginalPackage: FinanceClosePackage;
}
const september = { from: '2026-09-01', to: '2026-10-01' };
const october = { from: '2026-10-01', to: '2026-11-01' };
const nights = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
const endpoint = (world: RecognitionCloseWorld) => `/api/businesses/${world.financeFixture.business.id}/finance`;
const get = (world: RecognitionCloseWorld, path: string, token = world.financeToken) => request(world.app!.getHttpServer()).get(`${endpoint(world)}/${path}`).set('Authorization', `Bearer ${token}`);
const post = (world: RecognitionCloseWorld, path: string, body: object, key: string = randomUUID(), token = world.financeToken) => request(world.app!.getHttpServer()).post(`${endpoint(world)}/${path}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
async function certify(world: RecognitionCloseWorld, servedNights: string[]) {
  const sourceReport = (await get(world, 'recognition-sources').query({ from: september.from, to: october.to }).expect(200)).body as FinanceRecognitionSourceReport;
  const source = sourceReport.sources.find(row => row.bookingId === world.recBookingId)!;
  assert.ok(source.pricing); assert.ok(source.checkInEventId); assert.ok(source.checkOutEventId);
  world.recCommand = { bookingId: world.recBookingId, expectedBookingUpdatedAt: source.bookingUpdatedAt, expectedCertificateVersion: source.currentCertificate?.version ?? 0, expectedPricingSourceId: source.pricing.sourceId, servedNights, effectiveCheckInOn: '2026-09-29', effectiveCheckOutOn: '2026-10-03', evidence: 'Registro del huésped confirma estas noches efectivamente prestadas.', reason: 'OWNER certifica selección explícita.', supersedesCertificateId: source.currentCertificate?.id ?? null };
  world.recKey = randomUUID();
  await post(world, 'service-certificates', world.recCommand, world.recKey).expect(200);
}

Given('REC existen dos negocios sintéticos con OWNER y membresías reales', function (this: RecognitionCloseWorld) {
  assert.ok(this.app); assert.ok(this.financePrisma); assert.notEqual(this.financeFixture.business.id, this.financeFixture.foreignBusiness.id);
  assert.equal(this.financeToken.split('.').length, 3);
});
Given('REC existe una estancia del 29 de septiembre al 3 de octubre por 1200000 con ingreso y salida manuales', { timeout: 20000 }, async function (this: RecognitionCloseWorld) {
  const actor = this.financeFixture.actor;
  const booking = await this.financePrisma.booking.create({ data: { businessId: actor.businessId, status: 'CONFIRMED', checkInDate: new Date('2026-09-29'), checkOutDate: new Date('2026-10-03'), adults: 1, children: 0, resources: { create: { resourceId: this.financeFixture.resource.id } } } });
  const snapshot = await this.financePrisma.pricingSnapshot.create({ data: { businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1200000, items: [{ resourceId: this.financeFixture.resource.id, pricingMode: 'CALCULATED', agreedAmountMinor: 1200000, suggestedAmountMinor: 1200000, adjustmentAmountMinor: 0, overrideReason: null, nights: 4, breakdown: nights.map(date => ({ date, amountMinor: 300000 })) }] } });
  this.recBookingId = booking.id; this.recSnapshotId = snapshot.id;
  const operation = (path: string, expectedUpdatedAt: string) => request(this.app!.getHttpServer()).post(`/api/businesses/${actor.businessId}/bookings/${booking.id}/${path}`).set('Authorization', `Bearer ${this.financeToken}`).send({ expectedUpdatedAt, reason: 'Registro manual real del fixture de aceptación.' });
  const checkedIn = await operation('check-in', booking.updatedAt.toISOString()).expect(200);
  await operation('check-out', checkedIn.body.updatedAt as string).expect(200);
  const events = await this.financePrisma.bookingTimelineEvent.findMany({ where: { bookingId: booking.id } });
  assert.equal(events.length, 2); assert.ok(events.every(row => row.actorUserId === actor.actorUserId));
});
Given('REC el OWNER certifica explícitamente las cuatro noches de 300000', async function (this: RecognitionCloseWorld) { await certify(this, nights); });
When('REC el OWNER certifica sólo la noche del 29 de septiembre', async function (this: RecognitionCloseWorld) { await certify(this, [nights[0]]); });
Then('REC septiembre reconoce 600000 y octubre reconoce 600000', async function (this: RecognitionCloseWorld) {
  for (const period of [september, october]) {
    const result = await get(this, 'profitability').query(period).expect(200);
    assert.equal(result.body.totals.serviceRevenueMinor, 600000); assert.equal(result.body.totals.terminalRevenueMinor, 0); assert.equal(result.body.units.length, 2);
  }
});
Then('REC repetir la certificación con su clave conserva un certificado y cuatro unidades', async function (this: RecognitionCloseWorld) {
  await post(this, 'service-certificates', this.recCommand, this.recKey).expect(200);
  assert.equal(await this.financePrisma.financeServiceCertificate.count(), 1); assert.equal(await this.financePrisma.financeServiceUnit.count(), 4);
});
Then('REC septiembre reconoce 300000 y tiene una noche pendiente sin margen calculado', async function (this: RecognitionCloseWorld) {
  const result = await get(this, 'profitability').query(september).expect(200);
  assert.equal(result.body.totals.serviceRevenueMinor, 300000); assert.equal(result.body.totals.marginBasisPoints, null); assert.equal(result.body.coverage.complete, false);
  assert.equal(result.body.coverage.pendingByReason.SERVICE_NIGHT_NOT_CERTIFIED, 1);
  assert.deepEqual(result.body.pendingServiceNights.map((row: { localNight: string }) => row.localNight), ['2026-09-30']);
});
Then('REC existen exactamente una unidad de servicio y el precio exigible original', async function (this: RecognitionCloseWorld) {
  assert.equal(await this.financePrisma.financeServiceUnit.count(), 1);
  assert.equal((await this.financePrisma.pricingSnapshot.findUniqueOrThrow({ where: { id: this.recSnapshotId } })).totalAmountMinor, 1200000n);
});
When('REC un usuario {word} intenta consultar fuentes y certificar prestación', async function (this: RecognitionCloseWorld, role: MembershipRole) {
  const token = await realFinanceToken(this.app!, this.financeFixture.users[role].id);
  this.recResponses = [await get(this, 'recognition-sources', token).query(september), await post(this, 'service-certificates', {}, randomUUID(), token)];
});
Then('REC las dos acciones responden 403 sin certificado ni request financiero', async function (this: RecognitionCloseWorld) {
  assert.deepEqual(this.recResponses.map(row => row.status), [403, 403]);
  assert.equal(await this.financePrisma.financeServiceCertificate.count(), 0); assert.equal(await this.financePrisma.financeRequest.count(), 0);
});
When('REC el OWNER cierra septiembre con checklist y token del servidor', { timeout: 20000 }, async function (this: RecognitionCloseWorld) {
  const period = await post(this, 'periods', { ...september, reason: 'Mes terminado de septiembre.' }).expect(200);
  this.recPeriodId = period.body.id as string;
  const sources = (await get(this, `periods/${this.recPeriodId}/prepare`).expect(200)).body as FinanceCloseSources;
  const acknowledgements = Object.fromEntries(['RECOGNITION_COVERAGE', 'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS'].map(key => [key, 'OWNER declara la excepción sintética visible, sin modificar hechos.']));
  const closed = await post(this, `periods/${this.recPeriodId}/close`, { expectedVersion: period.body.version, expectedSourceToken: sources.sourceToken, reason: 'Cierre mensual explícito de OWNER.', acknowledgements }).expect(200);
  this.recPeriodVersion = closed.body.period.version as number; this.recSnapshot = closed.body.snapshot as FinanceCloseSnapshot;
  this.recOriginalPackage = (await get(this, `periods/${this.recPeriodId}/package`).query({ snapshotId: this.recSnapshot.id }).expect(200)).body as FinanceClosePackage;
});
Then('REC el registry PostgreSQL acredita todos los writers financieros requeridos', async function (this: RecognitionCloseWorld) {
  const registry = await this.financePrisma.$queryRaw<{ writer: string; installed: boolean }[]>`SELECT writer,installed FROM "FinanceCloseGuardEvidence"`;
  assert.ok(FINANCE_CLOSE_WRITERS.length >= 40); assert.ok(FINANCE_CLOSE_WRITERS.every(writer => registry.some(row => row.writer === writer && row.installed)));
});
Then('REC un gasto consumido en septiembre responde 409 sin filas parciales', async function (this: RecognitionCloseWorld) {
  const requests = await this.financePrisma.financeRequest.count(); const audits = await this.financePrisma.financeAudit.count();
  await post(this, 'commands', { ...expenseCommand(this.financeFixture, 10000), dueOn: null }).expect(409);
  assert.equal(await this.financePrisma.financeExpense.count(), 0); assert.equal(await this.financePrisma.financeRequest.count(), requests); assert.equal(await this.financePrisma.financeAudit.count(), audits);
});
When('REC el OWNER reabre septiembre con versión y motivo', async function (this: RecognitionCloseWorld) {
  const reopened = await post(this, `periods/${this.recPeriodId}/reopen`, { expectedVersion: this.recPeriodVersion, reason: 'OWNER solicita corrección del hecho cerrado.' }).expect(200);
  assert.equal(reopened.body.period.status, 'OPEN'); assert.equal(reopened.body.period.version, this.recPeriodVersion + 1);
});
Then('REC el snapshot y CSV anteriores conservan exactamente su hash y contenido', async function (this: RecognitionCloseWorld) {
  const stored = (await get(this, `periods/${this.recPeriodId}/package`).query({ snapshotId: this.recSnapshot.id }).expect(200)).body as FinanceClosePackage;
  assert.deepEqual(stored, this.recOriginalPackage); assert.equal(stored.snapshot.payloadHash, this.recSnapshot.payloadHash);
});
Then('REC el gasto septiembre ya puede registrarse en el período reabierto', async function (this: RecognitionCloseWorld) {
  await post(this, 'commands', { ...expenseCommand(this.financeFixture, 10000), dueOn: null }).expect(200);
  assert.equal(await this.financePrisma.financeExpense.count(), 1);
});
