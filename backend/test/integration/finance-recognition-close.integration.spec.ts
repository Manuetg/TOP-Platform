import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/modules/business/business.contract';
import { isFinancePeriodClosedError } from '../../src/shared/infrastructure/finance-period.guard';
import { OperateBookingUseCase } from '../../src/modules/booking-lifecycle/application/operate-booking.use-case';
import { BookingOperation } from '../../src/modules/booking-lifecycle/booking-operation.contract';
import { FinanceCorrectionsUseCases } from '../../src/modules/finance/application/finance-corrections.use-cases';
import { FINANCE_CLOSE_OPERATIONS, type FinanceCloseOperations, type FinanceCloseAcknowledgements } from '../../src/modules/finance/application/finance-close.operations';
import { FINANCE_RECOGNITION_OPERATIONS, type FinanceRecognitionOperations } from '../../src/modules/finance/application/finance-recognition.operations';
import { FINANCE_CLOSE_WRITERS } from '../../src/modules/finance/domain/finance-close.rules';
import type { CertifyServiceCommand, ServiceCertificate } from '../../src/modules/finance/domain/finance-recognition.types';
import { FINANCE_V2_REPOSITORY, type FinanceV2Command, type FinanceV2Repository } from '../../src/modules/finance/domain/finance-v2.types';
import { FINANCE_REPOSITORY, type FinanceActor, type FinanceRepository } from '../../src/modules/finance/domain/finance.types';
import { PrismaFinanceCloseRepository } from '../../src/modules/finance/infrastructure/finance-close.repository';
import { PrismaFinanceRepository } from '../../src/modules/finance/infrastructure/prisma-finance.repository';
import { FINANCE_RECOGNITION_PUBLIC_READERS, FINANCE_RECOGNITION_COST_READER, FINANCE_CLOSE_SUPPLEMENT_READER, type FinanceRecognitionPublicReaders, type FinanceRecognitionCostReader, type FinanceCloseSupplementReader } from '../../src/modules/finance/infrastructure/finance-recognition.readers';
import { assertFinanceDatabase, closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, financeMutation, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';

const september = { from: '2026-09-01', to: '2026-10-01' };
const october = { from: '2026-10-01', to: '2026-11-01' };
const goldenNights = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
const acknowledgements: FinanceCloseAcknowledgements = {
  RECOGNITION_COVERAGE: 'QA: se declara la cobertura incompleta sin inventar ingreso.',
  ACCOUNT_OPENINGS: 'QA: no se afirma saldo conocido de una cuenta sin apertura.',
  EVIDENCE: 'QA: comprobante pendiente de la fuente sintética.',
  MOVEMENT_REVIEW: 'QA: revisión de movimientos pendiente y visible.',
  CASH_COUNTS: 'QA: diferencia de arqueo pendiente y visible.',
};
interface Projection {
  units: { certificateId: string; localNight: string; amountMinor: number }[];
  pendingServiceNights: { sourceId: string; sourceVersion: string; bookingId: string; localNight: string; reason: string }[];
  totals: { serviceRevenueMinor: number; terminalRevenueMinor: number; costMinor: number; resultMinor: number; marginBasisPoints: number | null };
  coverage: { complete: boolean; pendingByReason: Record<string, number> };
  rows: { resourceId: string | null; costMinor: number; serviceRevenueMinor: number }[];
}
function servicePricingItem(resourceId: string, mode: 'CALCULATED' | 'MANUAL_OVERRIDE' | 'MANUAL_NO_RATE_PLAN', total: number, weights: number[]) {
  const suggested = weights.reduce((sum, amount) => sum + amount, 0);
  return { resourceId, pricingMode: mode, agreedAmountMinor: total,
    suggestedAmountMinor: mode === 'MANUAL_NO_RATE_PLAN' ? null : suggested,
    adjustmentAmountMinor: mode === 'MANUAL_NO_RATE_PLAN' ? null : total - suggested,
    overrideReason: mode === 'CALCULATED' ? null : 'Acuerdo explícito sintético', nights: 4,
    breakdown: mode === 'MANUAL_NO_RATE_PLAN' ? [] : goldenNights.map((date, index) => ({ date, amountMinor: weights[index] })) };
}
function signal() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function bounded<T>(promise: Promise<T>, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('QA: barrera PostgreSQL excedió su límite.')), milliseconds); })]);
  } finally { if (timer) clearTimeout(timer); }
}

// No describe.skip ni mocks: la ejecución requiere el GO de root y el helper de DB sintética.
describe('Recognition y cierre: PostgreSQL real, aislamiento y hechos inmutables', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fixture: FinanceFixture;
  let recognition: FinanceRecognitionOperations;
  let close: FinanceCloseOperations;
  let finance: FinanceRepository;
  let v2: FinanceV2Repository;
  let operations: OperateBookingUseCase;
  let corrections: FinanceCorrectionsUseCases;

  beforeAll(async () => {
    app = await createFinanceApp(); prisma = app.get(PrismaService);
    recognition = app.get(FINANCE_RECOGNITION_OPERATIONS); close = app.get(FINANCE_CLOSE_OPERATIONS);
    finance = app.get(FINANCE_REPOSITORY); v2 = app.get(FINANCE_V2_REPOSITORY);
    operations = app.get(OperateBookingUseCase); corrections = app.get(FinanceCorrectionsUseCases);
  });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  async function service(input: { actor?: FinanceActor; resourceId?: string; complete?: boolean; mode?: 'CALCULATED' | 'MANUAL_OVERRIDE' | 'MANUAL_NO_RATE_PLAN'; total?: number; weights?: number[] } = {}) {
    const actor = input.actor ?? fixture.actor;
    const resourceId = input.resourceId ?? fixture.resource.id;
    const booking = await prisma.booking.create({ data: {
      businessId: actor.businessId, status: 'CONFIRMED', checkInDate: new Date('2026-09-29'), checkOutDate: new Date('2026-10-03'),
      updatedAt: new Date('2026-09-28T12:00:00.000Z'), adults: 1, children: 0, resources: { create: { resourceId } },
    } });
    const total = input.total ?? 1200000;
    const mode = input.mode ?? 'CALCULATED';
    const weights = input.weights ?? [300000, 300000, 300000, 300000];
    const snapshot = await prisma.pricingSnapshot.create({ data: {
      businessId: actor.businessId, bookingId: booking.id, currency: 'PYG', totalAmountMinor: total,
      items: [servicePricingItem(resourceId, mode, total, weights)],
    } });
    await operations.execute({ ...actor, bookingId: booking.id, operation: BookingOperation.CHECK_IN, expectedUpdatedAt: booking.updatedAt.toISOString(), reason: 'Ingreso manual observado por OWNER.' });
    let current = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    if (input.complete !== false) {
      await operations.execute({ ...actor, bookingId: booking.id, operation: BookingOperation.CHECK_OUT, expectedUpdatedAt: current.updatedAt.toISOString(), reason: 'Salida manual observada por OWNER.' });
      current = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    }
    const events = await prisma.bookingTimelineEvent.findMany({ where: { bookingId: booking.id }, orderBy: { occurredAt: 'asc' } });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'BOOKING_CHECKED_IN', actorUserId: actor.actorUserId, details: expect.objectContaining({ source: 'MANUAL', operation: 'CHECK_IN' }) })]));
    return { booking: current, snapshot, actor, resourceId };
  }
  type Service = Awaited<ReturnType<typeof service>>;
  function certificateCommand(value: Service, servedNights = goldenNights, previous?: ServiceCertificate, effectiveCheckOutOn: string | null = '2026-10-03'): CertifyServiceCommand {
    return { bookingId: value.booking.id, expectedBookingUpdatedAt: value.booking.updatedAt.toISOString(), expectedCertificateVersion: previous?.version ?? 0, expectedPricingSourceId: previous?.pricing.sourceId ?? value.snapshot.id, servedNights, effectiveCheckInOn: '2026-09-29', effectiveCheckOutOn, evidence: 'Registro manual del huésped: noches efectivamente prestadas.', reason: 'Certificación explícita del servicio observado.', supersedesCertificateId: previous?.id ?? null };
  }
  const project = async (period = september) => await recognition.profitability(fixture.actor, period) as unknown as Projection;
  const mutateV2 = (command: FinanceV2Command, key = randomUUID()) => v2.execute({ ...fixture.actor, command, idempotencyKey: key, fingerprint: createHash('sha256').update(JSON.stringify(command)).digest('hex') });
  async function finishSeptember() {
    const period = await close.createPeriod(fixture.actor, { ...september, reason: 'Mes de septiembre terminado.' }, randomUUID());
    const sources = await close.prepareClose(fixture.actor, period.id);
    const result = await close.closePeriod(fixture.actor, period.id, { expectedVersion: period.version, expectedSourceToken: sources.sourceToken, reason: 'Cierre OWNER sintético con excepciones visibles.', acknowledgements }, randomUUID());
    expect(result.snapshot).not.toBeNull();
    return { period: result.period, snapshot: result.snapshot! };
  }
  async function counts() {
    const [requests, audits, certificates, units, terminals, snapshots, events, payments, adjustments, reversals, settlements] = await Promise.all([
      prisma.financeRequest.count(), prisma.financeAudit.count(), prisma.financeServiceCertificate.count(), prisma.financeServiceUnit.count(),
      prisma.financeTerminalRecognition.count(), prisma.financeCloseSnapshot.count(), prisma.financeCloseEvent.count(), prisma.payment.count(),
      prisma.paymentAdjustment.count(), prisma.paymentApplicationReversal.count(), prisma.financeSettlement.count(),
    ]);
    return { requests, audits, certificates, units, terminals, snapshots, events, payments, adjustments, reversals, settlements };
  }
  async function bank() {
    return finance.execute(financeMutation(fixture.actor, { type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco QA cierre', opening: { amountMinor: 2000000, occurredAt: '2026-09-01T12:00:00Z', reason: 'Apertura conocida.' } }));
  }
  async function payment(value: Service, amountMinor = 600000, paidAt = '2026-09-30T12:00:00Z') {
    const plan = await prisma.paymentPlan.create({ data: { businessId: fixture.business.id, bookingId: value.booking.id, currency: 'PYG', totalAmountMinor: 1200000, createdByUserId: fixture.actor.actorUserId, updatedByUserId: fixture.actor.actorUserId } });
    const installment = await prisma.paymentPlanInstallment.create({ data: { paymentPlanId: plan.id, amountMinor: 1200000, sortOrder: 0 } });
    const paid = await prisma.payment.create({ data: { businessId: fixture.business.id, bookingId: value.booking.id, amountMinor, currency: 'PYG', method: 'CASH', paidAt: new Date(paidAt), recordedByUserId: fixture.actor.actorUserId, idempotencyKey: randomUUID(), requestFingerprint: 'recognition-close-synthetic-payment' } });
    await prisma.paymentApplication.create({ data: { paymentId: paid.id, installmentId: installment.id, amountMinor } });
    return { plan, installment, paid };
  }

  it('Golden A: cuatro noches300000 producen600000 en septiembre y600000 en octubre sólo después de certificarlas', async () => {
    const value = await service();
    expect((await project()).totals.serviceRevenueMinor).toBe(0);
    const command = certificateCommand(value);
    const key = randomUUID();
    const certificate = await recognition.certifyService(fixture.actor, command, key);
    expect(certificate.units).toEqual(goldenNights.map(localNight => ({ localNight, amountMinor: 300000 })));
    expect(certificate).toMatchObject({ version: 1, recordedByUserId: fixture.actor.actorUserId, pricing: { sourceId: value.snapshot.id }, servicePolicyVersion: 'NIGHT_SERVICE_V1' });
    expect((await project()).totals).toMatchObject({ serviceRevenueMinor: 600000, terminalRevenueMinor: 0 });
    expect((await project(october)).totals.serviceRevenueMinor).toBe(600000);
    const before = await counts();
    expect(await recognition.certifyService(fixture.actor, command, key)).toEqual(certificate);
    expect(await counts()).toEqual(before);
    expect((await prisma.pricingSnapshot.findUniqueOrThrow({ where: { id: value.snapshot.id } })).totalAmountMinor).toBe(1200000n);
  });

  it('certificado disperso declara huecos dentro del tramo efectivo, margen desconocido y ninguna noche o ingreso inventados', async () => {
    const value = await service({ complete: false });
    const first = await recognition.certifyService(fixture.actor, certificateCommand(value, ['2026-09-29', '2026-10-02'], undefined, null), randomUUID());
    const septemberResult = await project(); const octoberResult = await project(october);
    expect(septemberResult.totals).toMatchObject({ serviceRevenueMinor: 300000, marginBasisPoints: null });
    expect(septemberResult.coverage).toMatchObject({ complete: false, pendingByReason: { SERVICE_NIGHT_NOT_CERTIFIED: 1 } });
    expect(septemberResult.pendingServiceNights).toEqual([{ sourceId: `SERVICE_CERTIFICATE:${first.id}:2026-09-30`, sourceVersion: '1', bookingId: value.booking.id, localNight: '2026-09-30', reason: 'SERVICE_NIGHT_NOT_CERTIFIED' }]);
    expect(octoberResult.pendingServiceNights.map(row => row.localNight)).toEqual(['2026-10-01']);
    expect(await prisma.financeServiceUnit.count()).toBe(2);
    const second = await recognition.certifyService(fixture.actor, certificateCommand(value, goldenNights, first, null), randomUUID());
    expect(second).toMatchObject({ version: 2, supersedesCertificateId: first.id });
    expect((await project()).totals.serviceRevenueMinor).toBe(600000);
    expect((await project()).pendingServiceNights).toEqual([]);
    await expect(recognition.certifyService(fixture.actor, certificateCommand(value, goldenNights, first, null), randomUUID())).rejects.toMatchObject({ code: 'CERTIFICATE_VERSION_CONFLICT' });
    expect(await prisma.financeServiceCertificate.count()).toBe(2);
  });

  it('salida anticipada conserva precio exigible y mapa fijo: una noche300000, sin redistribuir900000 no prestados', async () => {
    const value = await service();
    const certificate = await recognition.certifyService(fixture.actor, certificateCommand(value, ['2026-09-29'], undefined, '2026-09-30'), randomUUID());
    expect(certificate.units).toEqual([{ localNight: '2026-09-29', amountMinor: 300000 }]);
    expect((await project()).pendingServiceNights).toEqual([]);
    expect((await project(october)).totals.serviceRevenueMinor).toBe(0);
    expect((await prisma.pricingSnapshot.findUniqueOrThrow({ where: { id: value.snapshot.id } })).totalAmountMinor).toBe(1200000n);
    await expect(recognition.certifyService(fixture.actor, certificateCommand(value, goldenNights, certificate, '2026-10-04'), randomUUID())).rejects.toThrow();
  });

  it('CALENDAR/status sin evidencia manual y noche local de hoy no certifican servicio ni dejan request/audit', async () => {
    const booking = await prisma.booking.create({ data: { businessId: fixture.business.id, status: 'COMPLETED', checkInDate: new Date('2026-09-29'), checkOutDate: new Date('2026-10-03'), resources: { create: { resourceId: fixture.resource.id } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: fixture.business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1200000, items: [{ resourceId: fixture.resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 1200000, overrideReason: 'Acuerdo', nights: 4, breakdown: [] }] } });
    const before = await counts();
    await expect(recognition.certifyService(fixture.actor, certificateCommand({ booking, snapshot, actor: fixture.actor, resourceId: fixture.resource.id }), randomUUID())).rejects.toThrow();
    expect(await counts()).toEqual(before);
    const sources = await recognition.recognitionSources(fixture.actor, { from: '2026-09-01', to: '2026-11-01' });
    expect(sources.sources.find(row => row.bookingId === booking.id)?.eligibleNights).toEqual([]);
    expect(sources.sources.every(row => row.eligibleNights.every(night => night < sources.localToday))).toBe(true);
  });

  it('contexto Booking mutable posterior no se presenta como un asOf histórico: conserva ingreso certificado y declara stale', async () => {
    const value = await service(); await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    await prisma.booking.update({ where: { id: value.booking.id }, data: { checkOutDate: new Date('2026-10-04') } });
    const result = await project();
    expect(result.totals).toMatchObject({ serviceRevenueMinor: 600000, marginBasisPoints: null });
    expect(result.coverage).toMatchObject({ complete: false, pendingByReason: { CERTIFICATE_CONTEXT_STALE: 1 } });
    expect(await prisma.financeServiceUnit.count()).toBe(4);
  });

  it('guard SQL rechaza writer RR antes de hechos y no deja fila: escrituras financieras exigen READ COMMITTED', async () => {
    const value = await service(); const before = await counts();
    await expect(prisma.$transaction(tx => tx.payment.create({ data: { businessId: fixture.business.id, bookingId: value.booking.id, amountMinor: 10000, currency: 'PYG', method: 'CASH', paidAt: new Date('2026-10-02'), recordedByUserId: fixture.actor.actorUserId, idempotencyKey: randomUUID(), requestFingerprint: 'qa-rr-rejected' } }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })).rejects.toThrow('FINANCE_WRITE_IMPACT_INVALID');
    expect(await counts()).toEqual(before);
  });

  it.each([
    { mode: 'MANUAL_OVERRIDE' as const, total: 7, weights: [1, 2, 3, 4], amounts: [1, 1, 2, 3] },
    { mode: 'MANUAL_NO_RATE_PLAN' as const, total: 7, weights: [0, 0, 0, 0], amounts: [2, 2, 2, 1] },
  ])('$mode conserva reparto exacto BigInt sobre todas las noches pactadas antes de seleccionar el subconjunto', async input => {
    const value = await service(input);
    const result = await recognition.certifyService(fixture.actor, certificateCommand(value, ['2026-09-29', '2026-10-02']), randomUUID());
    expect(result.units.map(row => row.amountMinor)).toEqual([input.amounts[0], input.amounts[3]]);
    expect((await prisma.pricingSnapshot.findUniqueOrThrow({ where: { id: value.snapshot.id } })).totalAmountMinor).toBe(BigInt(input.total));
  });

  it('fallo real BEFORE INSERT de audit revierte certificado, unidades, head y request; retry crea un solo hecho', async () => {
    const value = await service(); const command = certificateCommand(value); const key = randomUUID(); const before = await counts();
    await prisma.$executeRawUnsafe("CREATE FUNCTION recognition_close_qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'recognition_close_qa_audit_failure'; END $$");
    await prisma.$executeRawUnsafe('CREATE TRIGGER recognition_close_qa_fail_audit BEFORE INSERT ON "FinanceAudit" FOR EACH ROW EXECUTE FUNCTION recognition_close_qa_fail_audit()');
    try {
      await expect(recognition.certifyService(fixture.actor, command, key)).rejects.toThrow('recognition_close_qa_audit_failure');
      expect(await counts()).toEqual(before); expect(await prisma.financeServiceHead.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER recognition_close_qa_fail_audit ON "FinanceAudit"');
      await prisma.$executeRawUnsafe('DROP FUNCTION recognition_close_qa_fail_audit()');
    }
    await recognition.certifyService(fixture.actor, command, key); await recognition.certifyService(fixture.actor, command, key);
    expect(await prisma.financeServiceCertificate.count()).toBe(1); expect(await prisma.financeServiceUnit.count()).toBe(4);
    expect(await prisma.financeRequest.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('D2 no-show: final exigible200000 no es noche; reconocimiento manual separado y refund no suman ingreso duplicado', async () => {
    const value = await service({ complete: false });
    // Otro servicio terminal se crea Confirmed y se opera NO_SHOW realmente; no se fabrica Timeline de prestación.
    const booking = await prisma.booking.create({ data: { businessId: fixture.business.id, status: 'CONFIRMED', checkInDate: new Date('2026-09-29'), checkOutDate: new Date('2026-10-03'), resources: { create: { resourceId: fixture.resource.id } } } });
    const snapshot = await prisma.pricingSnapshot.create({ data: { businessId: fixture.business.id, bookingId: booking.id, currency: 'PYG', totalAmountMinor: 1200000, items: value.snapshot.items as Prisma.InputJsonValue } });
    await operations.execute({ ...fixture.actor, bookingId: booking.id, operation: BookingOperation.NO_SHOW, expectedUpdatedAt: booking.updatedAt.toISOString(), reason: 'No se presentó el huésped.' });
    const terminalBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    const paid = await payment({ ...value, booking: terminalBooking, snapshot }); const account = await bank();
    await finance.execute(financeMutation(fixture.actor, { type: 'LINK_PAYMENT', paymentId: paid.paid.id, accountId: account.id, expectedVersion: 0, reason: 'Cobro registrado en banco.' }));
    let current = (await corrections.read(fixture.actor)).bookings.find(row => row.bookingId === booking.id)!;
    const terminal = await corrections.terminalPricing(fixture.actor, { type: 'SET_TERMINAL_FINAL_AMOUNT', bookingId: booking.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, finalAmountMinor: 200000, reason: 'Acuerdo final de cancelación, sin prestación.' }, randomUUID());
    expect((await project()).totals.terminalRevenueMinor).toBe(0);
    const selected = (await recognition.recognitionSources(fixture.actor, september)).sources.find(row => row.bookingId === booking.id)!;
    const entry = await recognition.recognizeTerminal(fixture.actor, { bookingId: booking.id, expectedBookingUpdatedAt: selected.bookingUpdatedAt, expectedVersion: 0, expectedPricingRevisionId: terminal.pricingRevisionId, serviceCertificateId: null, serviceCertificateVersion: 0, recognitionOn: '2026-09-30', confirmedNonServiceAmountMinor: 200000, coverage: 'DECLARED_NONE', classification: 'Compensación por cancelación acordada', reason: 'OWNER confirma ausencia de noches prestadas y clasificación.' }, randomUUID());
    expect(entry).toMatchObject({ finalAmountMinor: 200000, serviceAmountMinor: 0, amountMinor: 200000 });
    expect(await prisma.financeServiceUnit.count({ where: { bookingId: booking.id } })).toBe(0);
    expect((await project()).totals.terminalRevenueMinor).toBe(200000);
    current = (await corrections.read(fixture.actor)).bookings.find(row => row.bookingId === booking.id)!;
    await corrections.paymentAdjustment(fixture.actor, { type: 'REFUND_PAYMENT', bookingId: booking.id, paymentId: paid.paid.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, expectedPaymentVersion: current.payments[0].paymentVersion, amountMinor: 100000, occurredAt: '2026-10-02T12:00:00Z', accountId: account.id, expectedAccountVersion: account.version, reference: 'Salida bancaria externa real', reason: 'Devolución parcial posterior al acuerdo.' }, randomUUID());
    expect((await project()).totals.terminalRevenueMinor).toBe(200000);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paid.paid.id } })).amountMinor).toBe(600000n);
    expect((await prisma.pricingSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).totalAmountMinor).toBe(1200000n);
    expect(await prisma.paymentAdjustment.count()).toBe(1);
  });

  it('registry deriva del catálogo PostgreSQL: todos los writers requeridos instalados, funciones y triggers ALWAYS reales', async () => {
    const rows = await prisma.$queryRaw<{ writer: string; installed: boolean }[]>`SELECT writer,installed FROM "FinanceCloseGuardEvidence" ORDER BY writer`;
    expect(FINANCE_CLOSE_WRITERS.length).toBeGreaterThanOrEqual(40);
    expect(rows.filter(row => row.installed).map(row => row.writer)).toEqual(expect.arrayContaining([...FINANCE_CLOSE_WRITERS]));
    const functions = await prisma.$queryRaw<{ valid: boolean }[]>`SELECT top_finance_guard_functions_valid() AS valid`;
    expect(functions).toEqual([{ valid: true }]);
    const triggers = await prisma.$queryRaw<{ tableName: string; enabled: string }[]>`SELECT c.relname AS "tableName",t.tgenabled::text AS enabled FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname='top_finance_dml_guard' AND NOT t.tgisinternal`;
    expect(triggers.length).toBeGreaterThanOrEqual(40); expect(triggers.every(row => row.enabled === 'A')).toBe(true);
    expect(triggers.map(row => row.tableName)).toEqual(expect.arrayContaining(['Payment', 'PaymentAdjustment', 'PaymentApplication', 'PricingRevision', 'FinanceExpense', 'FinanceSettlement', 'FinanceBankRow', 'FinanceCostAllocation', 'FinanceBudgetRevision', 'FinanceCommitment', 'FinanceCloseSnapshot']));
  });

  it('cerrar/reabrir/recerrar conserva snapshot, CSV y hash anteriores; OWNER CAS y nuevos eventos/versiones', async () => {
    const value = await service(); const firstCertificate = await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    const { period, snapshot } = await finishSeptember(); const originalPackage = await close.readPackage(fixture.actor, period.id, snapshot.id);
    const before = await counts();
    await expect(close.reopenPeriod({ ...fixture.actor, actorUserId: fixture.users.ADMIN.id }, period.id, { expectedVersion: period.version, reason: 'Intento ADMIN.' }, randomUUID())).rejects.toThrow();
    await expect(close.reopenPeriod(fixture.actor, period.id, { expectedVersion: period.version - 1, reason: 'Versión vieja.' }, randomUUID())).rejects.toThrow();
    expect(await counts()).toEqual(before);
    await expect(prisma.$executeRaw`UPDATE "FinanceCloseSnapshot" SET "payloadHash"=${'0'.repeat(64)} WHERE id=${snapshot.id}`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "FinanceCloseSnapshot" WHERE id=${snapshot.id}`).rejects.toThrow();
    const reopened = await close.reopenPeriod(fixture.actor, period.id, { expectedVersion: period.version, reason: 'OWNER reabre para corregir prestación observada.' }, randomUUID());
    expect(reopened.period).toMatchObject({ status: 'OPEN', version: 3, latestSnapshotId: snapshot.id });
    await recognition.certifyService(fixture.actor, certificateCommand(value, ['2026-09-29'], firstCertificate, '2026-09-30'), randomUUID());
    const newSources = await close.prepareClose(fixture.actor, period.id);
    const next = await close.closePeriod(fixture.actor, period.id, { expectedVersion: reopened.period.version, expectedSourceToken: newSources.sourceToken, reason: 'Nuevo cierre corregido.', acknowledgements }, randomUUID());
    expect(next.period).toMatchObject({ status: 'CLOSED', version: 4 });
    expect(next.snapshot).toMatchObject({ previousSnapshotId: snapshot.id, closeVersion: 4 });
    expect(next.snapshot!.id).not.toBe(snapshot.id);
    expect(await close.readPackage(fixture.actor, period.id, snapshot.id)).toEqual(originalPackage);
    expect((await close.readSnapshot(fixture.actor, period.id, snapshot.id)).payloadHash).toBe(snapshot.payloadHash);
    expect(await prisma.financeCloseSnapshot.count()).toBe(2); expect(await prisma.financeCloseEvent.count()).toBe(3);
  });

  it('SQL directo tras cierre bloquea fechas y referencias de Payment/applications/pricing/expense/bank/allocation/budget/commitment sin orphan', async () => {
    const value = await service(); await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    const account = await bank(); const paid = await payment(value);
    const common = expenseCommand(fixture, 180000);
    const expense = await finance.execute(financeMutation(fixture.actor, { ...common, dueOn: null, lines: common.lines.map(part => ({ ...part, resourceId: null })) }));
    const line = await prisma.financeExpenseLine.findFirstOrThrow({ where: { expenseId: expense.id } });
    expect(line).toMatchObject({ resourceId: null, bookingId: null });
    const rule = await mutateV2({ type: 'CREATE_ALLOCATION_RULE', name: 'Reparto de QA', validFrom: '2026-09-01', validTo: '2026-10-01', parts: [{ resourceId: fixture.resource.id, basisPoints: 5000 }] });
    await mutateV2({ type: 'APPLY_COST_ALLOCATION', source: { kind: 'EXPENSE_LINE', id: line.id }, expectedSourceVersion: 1, ruleId: rule.id, ruleVersion: 1, expectedAllocationVersion: 0, reason: 'Mitad recurso y mitad sin asignar.' });
    const allocation = await prisma.financeCostAllocation.findFirstOrThrow();
    await mutateV2({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-09', expectedBudgetVersion: 0, lines: [{ categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 300000 }], reason: 'Presupuesto septiembre.' });
    const budget = await prisma.financeBudget.findFirstOrThrow();
    const commitment = await mutateV2({ type: 'CREATE_COMMITMENT', description: 'Compromiso septiembre', amountMinor: 50000, categoryId: fixture.category.id, resourceId: fixture.resource.id, expectedConsumptionOn: '2026-09-30', dueOn: null, operational: true, reference: null, reason: 'Compra prevista.' });
    const statement = await prisma.financeBankStatement.create({ data: { businessId: fixture.business.id, accountId: account.id, sourceNamespace: 'recognition-close-qa', canonicalDigest: 'a'.repeat(64), recordedByUserId: fixture.actor.actorUserId, result: {} } });
    const bankRow = await prisma.financeBankRow.create({ data: { businessId: fixture.business.id, accountId: account.id, statementId: statement.id, sourceNamespace: statement.sourceNamespace, externalKey: 'sept-row', payloadDigest: 'b'.repeat(64), bookedOn: new Date('2026-09-30'), amountMinor: 600000 } });
    const projection = await project();
    expect(projection.totals.costMinor).toBe(180000);
    expect(projection.rows.find(row => row.resourceId === fixture.resource.id)?.costMinor).toBe(90000);
    expect(projection.rows.find(row => row.resourceId === null)?.costMinor).toBe(90000);
    await prisma.resource.update({ where: { id: fixture.resource.id }, data: { status: 'ARCHIVED' } });
    expect((await project()).rows.find(row => row.resourceId === fixture.resource.id)).toMatchObject({ serviceRevenueMinor: 600000, costMinor: 90000 });
    const { period, snapshot } = await finishSeptember(); const original = await close.readPackage(fixture.actor, period.id, snapshot.id);
    const committed = await prisma.financeCommitment.findUniqueOrThrow({ where: { id: commitment.id } });
    const probes: { name: string; globalImmutable?: boolean; run: (tx: Prisma.TransactionClient) => Promise<unknown> }[] = [
      { name: 'Payment retroactivo', run: tx => tx.payment.create({ data: { ...paid.paid, id: randomUUID(), idempotencyKey: randomUUID(), paidAt: new Date('2026-09-15') } }) },
      // El original es inmutable también en un mes abierto; ese rechazo no acredita la guardia de cierre.
      { name: 'aplicación original', globalImmutable: true, run: tx => tx.$executeRaw`UPDATE "PaymentApplication" SET "amountMinor"="amountMinor"+1 WHERE "paymentId"=${paid.paid.id} AND "installmentId"=${paid.installment.id}` },
      { name: 'reprecio SERVICE', run: tx => tx.pricingRevision.create({ data: { businessId: fixture.business.id, bookingId: value.booking.id, originalSnapshotId: value.snapshot.id, revisionNumber: 1, kind: 'SERVICE', currency: 'PYG', totalAmountMinor: 1200000, items: value.snapshot.items as Prisma.InputJsonValue, previousPricing: { id: value.snapshot.id }, beforeContext: { checkInDate: '2026-09-29', checkOutDate: '2026-10-03', resourceIds: [fixture.resource.id] }, afterContext: { checkInDate: '2026-09-29', checkOutDate: '2026-10-03', resourceIds: [fixture.resource.id] }, paidAmountMinorAtSave: 600000, actorUserId: fixture.actor.actorUserId } }) },
      { name: 'gasto retroactivo', run: tx => tx.$executeRaw`UPDATE "FinanceExpense" SET reference='cambio posterior' WHERE id=${expense.id}` },
      { name: 'fila bancaria septiembre', run: tx => tx.financeBankRow.create({ data: { ...bankRow, id: randomUUID(), externalKey: `closed-${randomUUID()}` } }) },
      { name: 'nuevo reparto', run: tx => tx.financeCostAllocation.create({ data: { ...allocation, id: randomUUID(), revisionNo: 2, reason: 'Reparto posterior al cierre.' } }) },
      { name: 'presupuesto septiembre', run: tx => tx.financeBudgetRevision.create({ data: { businessId: fixture.business.id, budgetId: budget.id, revisionNo: 2, reason: 'Cambio cerrado.', recordedByUserId: fixture.actor.actorUserId } }) },
      { name: 'compromiso septiembre', run: tx => tx.financeCommitment.create({ data: { ...committed, id: randomUUID() } }) },
    ];
    for (const probe of probes) {
      const before = await counts(); const key = randomUUID();
      await expect(prisma.$transaction(async tx => {
        await tx.financeRequest.create({ data: { businessId: fixture.business.id, operation: 'QA_CLOSED_PROBE', idempotencyKey: key, fingerprint: 'f'.repeat(64), result: { probe: probe.name } } });
        await tx.financeAudit.create({ data: { businessId: fixture.business.id, actorUserId: fixture.actor.actorUserId, action: 'QA_CLOSED_PROBE', sourceId: key, details: { probe: probe.name } } });
        return probe.run(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 })).rejects.toThrow(probe.globalImmutable ? /FINANCE_PERIOD_CLOSED|inmutable|immutable|APPEND_ONLY/i : /FINANCE_PERIOD_CLOSED/);
      expect(await counts()).toEqual(before);
      expect(await prisma.financeRequest.count({ where: { idempotencyKey: key } })).toBe(0);
      expect(await close.readPackage(fixture.actor, period.id, snapshot.id)).toEqual(original);
    }
  });

  it('FIN022 usa sólo ExpenseLine.bookingId operativo: excluye Common/recurso y conserva revisión/asOf sin margen inventado', async () => {
    const value = await service(); await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    const draft = await mutateV2({ type: 'CREATE_EXPENSE_DRAFT', consumedOn: '2026-09-30', dueOn: null, expenseDefinition: {
      description: 'Costos explícitos de reserva y comunes separados.', counterpartyId: fixture.counterparty.id, reference: 'Comprobante QA FIN022', amountMinor: 150000,
      lines: [
        { label: 'Consumo directo', categoryId: fixture.category.id, resourceId: fixture.resource.id, bookingId: value.booking.id, amountMinor: 60000, operational: true },
        { label: 'Común', categoryId: fixture.category.id, resourceId: null, bookingId: null, amountMinor: 40000, operational: true },
        { label: 'Recurso sin reserva', categoryId: fixture.category.id, resourceId: fixture.resource.id, bookingId: null, amountMinor: 30000, operational: true },
        { label: 'No operativo explícito', categoryId: fixture.category.id, resourceId: fixture.resource.id, bookingId: value.booking.id, amountMinor: 20000, operational: false },
      ],
    } });
    const confirmed = await mutateV2({ type: 'CONFIRM_EXPENSE_DRAFT', id: draft.id, expectedVersion: draft.version, settlement: null, reason: 'Confirmar consumo real observado.' });
    const expenseId = confirmed.relatedIds!.expenseId!;
    const first = await recognition.bookingResult(fixture.actor, value.booking.id, september);
    expect(first).toMatchObject({ scope: 'DIRECT_BOOKING_COSTS_ONLY', serviceRevenueMinor: 600000, terminalRevenueMinor: 0, directOperationalCostMinor: 60000, contributionMinor: 540000, contributionMarginBasisPoints: 9000, coverage: { complete: true } });
    expect(first.directCostLines).toHaveLength(1); expect(first.directCostLines[0].expenseId).toBe(expenseId);
    expect((await recognition.bookingResult(fixture.actor, value.booking.id, { ...september, asOf: first.asOf, expectedSourceToken: first.token })).token).toBe(first.token);
    await finance.execute(financeMutation(fixture.actor, { type: 'SET_EVIDENCE', id: expenseId, expectedVersion: 1, reference: 'Comprobante añadido posteriormente.', reason: 'Enriquecer evidencia.' }));
    const historic = await recognition.bookingResult(fixture.actor, value.booking.id, { ...september, asOf: first.asOf });
    expect(historic).toMatchObject({ serviceRevenueMinor: 600000, directOperationalCostMinor: 60000, contributionMinor: null, contributionMarginBasisPoints: null, coverage: { complete: false, pendingByReason: { SOURCE_STALE: 1 } } });
    await expect(recognition.bookingResult(fixture.actor, value.booking.id, { ...september, expectedSourceToken: first.token })).rejects.toMatchObject({ code: 'SOURCE_TOKEN_CONFLICT' });
  });

  it('devolución octubre de Payment septiembre y liquidación octubre de Expense septiembre se permiten sin reescribir snapshot ni originales', async () => {
    const value = await service(); await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    const account = await bank(); const paid = await payment(value);
    const futurePayment = await prisma.payment.create({ data: { businessId: fixture.business.id, bookingId: value.booking.id, amountMinor: 100000, currency: 'PYG', method: 'CASH', paidAt: new Date('2026-10-02T12:00:00Z'), recordedByUserId: fixture.actor.actorUserId, idempotencyKey: randomUUID(), requestFingerprint: 'future-october-payment' } });
    await prisma.paymentApplication.create({ data: { paymentId: futurePayment.id, installmentId: paid.installment.id, amountMinor: 100000 } });
    await mutateV2({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-10', expectedBudgetVersion: 0, lines: [{ categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 400000 }], reason: 'Planificación futura octubre.' });
    const futureBudget = await prisma.financeBudget.findFirstOrThrow({ where: { periodMonth: '2026-10' } });
    const futureCommitment = await mutateV2({ type: 'CREATE_COMMITMENT', description: 'Compra futura octubre', amountMinor: 50000, categoryId: fixture.category.id, resourceId: fixture.resource.id, expectedConsumptionOn: '2026-10-03', dueOn: null, operational: true, reference: null, reason: 'Planificación mes abierto.' });
    const expense = await finance.execute(financeMutation(fixture.actor, { ...expenseCommand(fixture, 900000), dueOn: null }));
    const { period, snapshot } = await finishSeptember(); const original = await close.readPackage(fixture.actor, period.id, snapshot.id);
    let current = (await corrections.read(fixture.actor)).bookings.find(row => row.bookingId === value.booking.id)!;
    const originalPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paid.paid.id } });
    const originalExpense = await prisma.financeExpense.findUniqueOrThrow({ where: { id: expense.id } });
    const beforeClosedVoid = await counts();
    expect(current.payments.find(row => row.id === paid.paid.id)!.voidAllowed).toBe(true);
    await expect(corrections.paymentAdjustment(fixture.actor, { type: 'VOID_PAYMENT', bookingId: value.booking.id, paymentId: paid.paid.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, expectedPaymentVersion: current.payments.find(row => row.id === paid.paid.id)!.paymentVersion, reason: 'Anulación del original septiembre cerrado.' }, randomUUID())).rejects.toMatchObject({ code: 'FINANCE_PERIOD_CLOSED' });
    expect(await counts()).toEqual(beforeClosedVoid);
    const refund = await corrections.paymentAdjustment(fixture.actor, { type: 'REFUND_PAYMENT', bookingId: value.booking.id, paymentId: paid.paid.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, expectedPaymentVersion: current.payments.find(row => row.id === paid.paid.id)!.paymentVersion, amountMinor: 100000, occurredAt: '2026-10-02T12:00:00Z', accountId: account.id, expectedAccountVersion: account.version, reference: 'Devolución bancaria octubre', reason: 'La devolución se produjo en el mes abierto.' }, randomUUID());
    expect(refund.amounts).toMatchObject({ grossRecordedAmountMinor: 600000, refundedAmountMinor: 100000, netRetainedAmountMinor: 500000 });
    expect((await corrections.read(fixture.actor)).bookings.find(row => row.bookingId === value.booking.id)!.amounts).toMatchObject({ grossRecordedAmountMinor: 700000, refundedAmountMinor: 100000, netRetainedAmountMinor: 600000 });
    await finance.execute(financeMutation(fixture.actor, { type: 'SETTLE_EXPENSE', id: expense.id, expectedVersion: expense.version, settlement: { accountId: account.id, amountMinor: 300000, occurredAt: '2026-10-02T12:00:00Z', reference: 'Liquidación octubre de obligación septiembre' } }));
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paid.paid.id } })).toEqual(originalPayment);
    const changedExpense = await prisma.financeExpense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(changedExpense).toMatchObject({ amountMinor: originalExpense.amountMinor, consumedOn: originalExpense.consumedOn, version: originalExpense.version + 1 });
    expect(await close.readPackage(fixture.actor, period.id, snapshot.id)).toEqual(original);
    await mutateV2({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-10', expectedBudgetVersion: futureBudget.version, lines: [{ categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 450000 }], reason: 'Revisión octubre permitida tras cierre septiembre.' });
    await mutateV2({ type: 'CANCEL_COMMITMENT', id: futureCommitment.id, expectedVersion: futureCommitment.version, reason: 'Cancela compromiso octubre, sin afectar septiembre.' });
    current = (await corrections.read(fixture.actor)).bookings.find(row => row.bookingId === value.booking.id)!;
    await corrections.paymentAdjustment(fixture.actor, { type: 'VOID_PAYMENT', bookingId: value.booking.id, paymentId: futurePayment.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, expectedPaymentVersion: current.payments.find(row => row.id === futurePayment.id)!.paymentVersion, reason: 'Anulación registral de cobro octubre permitida.' }, randomUUID());
    expect(await close.readPackage(fixture.actor, period.id, snapshot.id)).toEqual(original);
    const before = await counts();
    current = (await corrections.read(fixture.actor)).bookings.find(row => row.bookingId === value.booking.id)!;
    await expect(corrections.paymentAdjustment(fixture.actor, { type: 'REFUND_PAYMENT', bookingId: value.booking.id, paymentId: paid.paid.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, expectedPaymentVersion: current.payments.find(row => row.id === paid.paid.id)!.paymentVersion, amountMinor: 1, occurredAt: '2026-09-30T12:00:00Z', accountId: account.id, expectedAccountVersion: account.version, reference: null, reason: 'Intento retroactivo bloqueado.' }, randomUUID())).rejects.toThrow();
    await expect(corrections.paymentAdjustment(fixture.actor, { type: 'VOID_PAYMENT', bookingId: value.booking.id, paymentId: paid.paid.id, expectedBookingUpdatedAt: current.bookingUpdatedAt, currentPricingId: current.pricing.currentPricingId, expectedFinancialVersion: current.financialVersion, expectedPaymentVersion: current.payments.find(row => row.id === paid.paid.id)!.paymentVersion, reason: 'Anulación del original cerrado bloqueada.' }, randomUUID())).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  async function independentClient(label: string): Promise<PrismaService> {
    const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('connection_limit', '1');
    const client = new PrismaService(new ConfigService({ DATABASE_URL: url.toString() }));
    await client.$connect(); await assertFinanceDatabase(client);
    await client.$queryRaw`SELECT set_config('application_name',${label},false)`;
    return client;
  }
  async function waitForLock(client: PrismaClient, label: string) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const rows = await client.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE application_name=${label} AND wait_event_type='Lock') AS waiting`;
      if (rows[0]?.waiting) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`QA: no se observó espera real de lock para ${label}.`);
  }
  function closeOn(client: PrismaService) {
    return new PrismaFinanceCloseRepository(client, app.get<FinanceRecognitionPublicReaders>(FINANCE_RECOGNITION_PUBLIC_READERS), app.get<FinanceRecognitionCostReader>(FINANCE_RECOGNITION_COST_READER), app.get<FinanceCloseSupplementReader>(FINANCE_CLOSE_SUPPLEMENT_READER));
  }

  it('carrera RC: CLOSE en cola primero gana; writer aguardando Business no usa snapshot viejo ni deja request/audit', async () => {
    const value = await service(); await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    const period = await close.createPeriod(fixture.actor, { ...september, reason: 'Septiembre terminado.' }, randomUUID());
    const sources = await close.prepareClose(fixture.actor, period.id);
    const closeLabel = `qa-close-${randomUUID()}`; const writerLabel = `qa-writer-${randomUUID()}`;
    const closeClient = await independentClient(closeLabel); const writerClient = await independentClient(writerLabel);
    const locked = signal(); const release = signal(); const before = await counts();
    let closing: Promise<unknown> | undefined; let writing: Promise<unknown> | undefined;
    const holding = prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'");
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id=${fixture.business.id} FOR UPDATE`;
      locked.release(); await bounded(release.promise);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    try {
      await bounded(locked.promise);
      closing = closeOn(closeClient).closePeriod(fixture.actor, period.id, { expectedVersion: 1, expectedSourceToken: sources.sourceToken, reason: 'Cierre obtiene lock antes que writer.', acknowledgements }, randomUUID());
      void closing.catch(() => undefined);
      await waitForLock(prisma, closeLabel);
      writing = new PrismaFinanceRepository(writerClient).execute(financeMutation(fixture.actor, { ...expenseCommand(fixture, 10000), dueOn: null }));
      void writing.catch(() => undefined);
      await waitForLock(prisma, writerLabel);
      release.release(); await bounded(holding);
      const outcomes = await bounded(Promise.allSettled([closing, writing]));
      expect(outcomes[0].status).toBe('fulfilled'); expect(outcomes[1].status).toBe('rejected');
      if (outcomes[1].status === 'rejected') {
        const failure: unknown = outcomes[1].reason;
        expect(isFinancePeriodClosedError(failure)).toBe(true);
      }
      expect((await close.listPeriods(fixture.actor))[0].status).toBe('CLOSED');
      expect(await prisma.financeExpense.count()).toBe(0);
      const after = await counts(); expect(after.requests).toBe(before.requests + 1); expect(after.audits).toBe(before.audits + 1);
    } finally {
      release.release(); await Promise.allSettled([holding, ...(closing ? [closing] : []), ...(writing ? [writing] : [])]);
      await Promise.all([closeClient.$disconnect(), writerClient.$disconnect()]);
    }
  }, 45000);

  it('carrera RC: writer primero confirma; CLOSE detecta token viejo y nuevo cierre incorpora el hecho confirmado', async () => {
    const value = await service(); await recognition.certifyService(fixture.actor, certificateCommand(value), randomUUID());
    const period = await close.createPeriod(fixture.actor, { ...september, reason: 'Septiembre terminado.' }, randomUUID());
    const sources = await close.prepareClose(fixture.actor, period.id);
    const label = `qa-close-writer-first-${randomUUID()}`; const closeClient = await independentClient(label); const writerClient = await independentClient(`qa-writer-first-${randomUUID()}`);
    const locked = signal(); const release = signal(); let closing: Promise<unknown> | undefined;
    const writing = writerClient.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout='10s'");
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id=${fixture.business.id} FOR SHARE`;
      await tx.payment.create({ data: { businessId: fixture.business.id, bookingId: value.booking.id, amountMinor: 10000, currency: 'PYG', method: 'CASH', paidAt: new Date('2026-09-30T12:00:00Z'), recordedByUserId: fixture.actor.actorUserId, idempotencyKey: randomUUID(), requestFingerprint: 'writer-first-real-pg' } });
      locked.release(); await bounded(release.promise);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
    try {
      await bounded(locked.promise);
      closing = closeOn(closeClient).closePeriod(fixture.actor, period.id, { expectedVersion: 1, expectedSourceToken: sources.sourceToken, reason: 'Debe releer tras writer confirmado.', acknowledgements }, randomUUID());
      void closing.catch(() => undefined); await waitForLock(prisma, label);
      release.release(); await bounded(writing);
      await expect(bounded(closing)).rejects.toMatchObject({ code: 'CLOSE_SOURCE_CONFLICT' });
      expect(await prisma.payment.count()).toBe(1); expect(await prisma.financeCloseSnapshot.count()).toBe(0);
      const current = await close.prepareClose(fixture.actor, period.id); expect(current.sourceToken).not.toBe(sources.sourceToken);
      const result = await close.closePeriod(fixture.actor, period.id, { expectedVersion: 1, expectedSourceToken: current.sourceToken, reason: 'Corte actual incluye writer confirmado.', acknowledgements }, randomUUID());
      expect(result.snapshot!.sourceRefs.some(row => row.type === 'PAYMENT')).toBe(true);
    } finally {
      release.release(); await Promise.allSettled([writing, ...(closing ? [closing] : [])]);
      await Promise.all([closeClient.$disconnect(), writerClient.$disconnect()]);
    }
  }, 45000);
});
