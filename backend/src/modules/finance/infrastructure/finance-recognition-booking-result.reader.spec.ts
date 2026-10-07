import { Prisma } from '@prisma/client';
import { readFinanceBookingResult } from './finance-recognition-booking-result.reader';
import { mapServicePricingBasis, terminalRecognitionSourceHash } from './finance-recognition.source';
import type { FinanceRecognitionPublicReaders, FinanceServiceEvidence } from './finance-recognition.readers';
import type { RecognitionCertificateRow } from './finance-recognition.db';
import type { FinanceRecognitionTerminalRow } from './finance-recognition.report';
import type { FinanceBookingResultQuery } from '../domain/finance-booking-result.types';

type Price = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>>>;
type CurrentPrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>>>;
const actor = { businessId: 'business', actorUserId: 'owner' };
const serverCut = '2026-10-05T12:00:00.000Z';
const range = { from: '2026-09-01', to: '2026-10-01' };
const dates = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
function fixture() {
  const booking: FinanceServiceEvidence = { businessId: 'business', bookingId: 'booking', resourceIds: ['resource'], bookingUpdatedAt: '2026-10-05T09:00:00.000Z', checkInDate: '2026-09-29', checkOutDate: '2026-10-03', status: 'COMPLETED', checkInEventId: 'manual-in', checkOutEventId: 'manual-out' };
  const price: Price = { id: 'price', businessId: 'business', bookingId: 'booking', originalSnapshotId: 'price', pricingRevisionId: null, revisionNumber: 0, currency: 'PYG', totalAmountMinor: 1200000, createdAt: new Date('2026-08-01'), kind: 'SERVICE', sourceKind: 'SNAPSHOT', sourceContext: { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, resourceIds: booking.resourceIds }, items: [{ resourceId: 'resource', ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 1200000, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Acuerdo manual.', nights: 4, breakdown: [] }] };
  const basis = mapServicePricingBasis(price);
  const certificate: RecognitionCertificateRow = { id: 'certificate', businessId: 'business', bookingId: 'booking', resourceId: 'resource', version: 1, supersedesCertificateId: null, originalSnapshotId: 'price', serviceRevisionId: null, sourceHash: basis.sourceHash, bookingUpdatedAt: new Date(booking.bookingUpdatedAt), effectiveCheckInOn: new Date('2026-09-29'), effectiveCheckOutOn: new Date('2026-10-03'), checkInEventId: 'manual-in', checkOutEventId: 'manual-out', pricing: basis as unknown as Prisma.JsonValue, policyVersion: 'EQUAL_AGREED_NIGHTS_V1', servicePolicyVersion: 'NIGHT_SERVICE_V1', evidence: 'Noches verificadas manualmente.', reason: 'Certificar servicio.', recordedByUserId: 'owner', recordedAt: new Date('2026-10-01T12:00:00Z') };
  const state = { booking: booking as FinanceServiceEvidence | null, service: price as Price | null, current: price as CurrentPrice | null, certificates: [certificate], units: dates.map(localNight => ({ localNight: new Date(localNight), amountMinor: 300000n })), terminals: [] as FinanceRecognitionTerminalRow[], costs: [] as ReturnType<typeof directCost>[] };
  const calls: Prisma.Sql[] = [];
  const tx = { $queryRaw: jest.fn((sql: Prisma.Sql) => {
    calls.push(sql);
    if (sql.sql.includes('FROM "FinanceExpenseLine"')) return Promise.resolve(state.costs);
    if (sql.sql.includes('FROM "FinanceServiceCertificate"')) return Promise.resolve(state.certificates);
    if (sql.sql.includes('FROM "FinanceServiceUnit"')) return Promise.resolve(state.units);
    if (sql.sql.includes('FROM "FinanceTerminalRecognition"')) return Promise.resolve(state.terminals);
    throw new Error(`Consulta inesperada: ${sql.sql}`);
  }) } as unknown as Prisma.TransactionClient;
  const readers = {
    evidence: jest.fn<ReturnType<FinanceRecognitionPublicReaders['evidence']>, Parameters<FinanceRecognitionPublicReaders['evidence']>>(() => Promise.resolve(state.booking)),
    servicePricing: jest.fn<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>, Parameters<FinanceRecognitionPublicReaders['servicePricing']>>(() => Promise.resolve(state.service)),
    currentPricing: jest.fn<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>, Parameters<FinanceRecognitionPublicReaders['currentPricing']>>(() => Promise.resolve(state.current)),
    evidenceBatch: jest.fn(() => Promise.resolve(new Map<string, FinanceServiceEvidence>())), candidates: jest.fn(() => Promise.resolve([])),
    servicePricingBatch: jest.fn(() => Promise.resolve(new Map<string, Price>())), currentPricingBatch: jest.fn(() => Promise.resolve(new Map<string, CurrentPrice>())),
  } satisfies FinanceRecognitionPublicReaders;
  return { state, calls, readers, read: (query: FinanceBookingResultQuery = range, cut = serverCut) => readFinanceBookingResult(tx, actor, 'booking', query, 'Etc/UTC', cut, readers) };
}
function directCost() {
  return { expenseId: 'expense', expenseVersion: 1, lineId: 'line', businessId: 'business', bookingId: 'booking', consumedOn: new Date('2026-09-30'), amountMinor: 30000n, operational: true, createdAt: new Date('2026-10-01T12:00:00Z'), bookingSourceUpdatedAt: new Date('2026-10-05T09:00:00Z'), bookingSourceStatus: 'COMPLETED', reference: 'Comprobante revisado.' as string | null, hasEvidenceFile: false, latestAuditId: 'expense-audit', latestAuditAt: new Date('2026-10-01T12:00:00Z') };
}

describe('FIN022 reserva: lector simulado, sin evidencia DB', () => {
  it('Golden A conserva600000 reconocidos en cada mes, antes de costos comunes excluidos', async () => {
    const test = fixture();
    const result = await test.read();
    expect(result).toMatchObject({ scope: 'DIRECT_BOOKING_COSTS_ONLY', revenueMinor: 600000, contributionMinor: 600000, contributionMarginBasisPoints: 10000, coverage: { complete: true, commonCostsExcluded: true, laborEstimatesExcluded: true, ownerWorkExcluded: true } });
    expect((await test.read({ from: '2026-10-01', to: '2026-11-01' })).revenueMinor).toBe(600000);
    expect(result.units).toHaveLength(2); expect(test.readers.candidates).not.toHaveBeenCalled();
  });
  it('cuenta cada ExpenseLine explícita una vez; SQL exige booking/operational/consumo/creación y no usa asignaciones', async () => {
    const test = fixture(); test.state.costs = [directCost()];
    const result = await test.read();
    expect(result).toMatchObject({ directOperationalCostMinor: 30000, contributionMinor: 570000, contributionMarginBasisPoints: 9500 });
    expect(result.directCostLines).toHaveLength(1);
    const sql = test.calls.find(call => call.sql.includes('FROM "FinanceExpenseLine"'))!;
    expect(sql.sql).toContain('l."bookingId"='); expect(sql.values).toContain('booking'); expect(sql.sql).toContain('l.operational=TRUE'); expect(sql.sql).toContain('e."createdAt"<=');
    expect(sql.sql).not.toContain('FinanceCostAllocation'); expect(sql.sql).not.toContain('FinanceLaborCost');
  });
  it('certificación dispersa conserva300000 y declara el hueco sin inventar ingreso ni margen', async () => {
    const test = fixture(); test.state.units = test.state.units.filter(unit => unit.localNight.toISOString().slice(0, 10) !== '2026-09-30');
    expect(await test.read()).toMatchObject({ serviceRevenueMinor: 300000, contributionMinor: null, contributionMarginBasisPoints: null, coverage: { complete: false, pendingByReason: { SERVICE_NIGHT_NOT_CERTIFIED: 1 } } });
  });
  it('asOf antiguo conserva hechos certificados y declara Booking mutable posterior, sin time travel', async () => {
    const test = fixture();
    expect(await test.read({ ...range, asOf: '2026-10-04T12:00:00.000Z' })).toMatchObject({ serviceRevenueMinor: 600000, contributionMinor: null, coverage: { pendingByReason: { SOURCE_STALE: 1 } } });
  });
  it('audit/header de Expense posterior al corte hace el margen desconocido sin borrar el costo real', async () => {
    const test = fixture(); const cost = directCost(); cost.latestAuditAt = new Date('2026-10-05T11:00:00Z'); test.state.costs = [cost];
    expect(await test.read({ ...range, asOf: '2026-10-05T10:00:00.000Z' })).toMatchObject({ directOperationalCostMinor: 30000, contributionMinor: null, coverage: { pendingByReason: { SOURCE_STALE: 1 } } });
  });
  it('costo sin referencia ni archivo comprobante conserva importe y declara cobertura incompleta', async () => {
    const test = fixture(); const cost = directCost(); cost.reference = null; test.state.costs = [cost];
    expect(await test.read()).toMatchObject({ directOperationalCostMinor: 30000, contributionMinor: null, coverage: { pendingByReason: { COST_EVIDENCE_MISSING: 1 } } });
    cost.hasEvidenceFile = true;
    expect(await test.read()).toMatchObject({ contributionMinor: 570000, coverage: { complete: true } });
  });
  it('procedencia Booking de costo obsoleta y fuente SERVICE cambiada dejan contribución null', async () => {
    const test = fixture(); const cost = directCost(); cost.bookingSourceStatus = 'IN_PROGRESS'; test.state.costs = [cost];
    test.state.service = { ...test.state.service!, id: 'new-service', pricingRevisionId: 'new-service', revisionNumber: 1, sourceKind: 'REVISION' };
    expect(await test.read()).toMatchObject({ contributionMinor: null, coverage: { pendingByReason: { DIRECT_COST_BOOKING_SOURCE_STALE: 1, CERTIFICATE_PRICING_STALE: 1 } } });
  });
  it('token se reproduce sin tiempo dinámico; importe/versión cambiados rechazan el token anterior', async () => {
    const test = fixture(); test.state.costs = [directCost()]; const first = await test.read();
    expect((await test.read(range, '2026-10-05T13:00:00.000Z')).token).toBe(first.token);
    test.state.costs[0].amountMinor = 30001n;
    await expect(test.read({ ...range, expectedSourceToken: first.token })).rejects.toMatchObject({ code: 'SOURCE_TOKEN_CONFLICT' });
  });
  it('F=S+N sólo agrega la partida terminal no servicio; no cuenta el final como noches ni cobros', async () => {
    const test = fixture(); test.state.booking!.status = 'NO_SHOW';
    const final: CurrentPrice = { ...test.state.current!, id: 'final', kind: 'TERMINAL_FINAL_AMOUNT', pricingRevisionId: 'final', revisionNumber: 1, totalAmountMinor: 1400000, items: [], sourceContext: { servicePricingId: 'price', finalAmountMinor: 1400000 } };
    test.state.current = final;
    test.state.terminals = [{ id: 'terminal', bookingId: 'booking', resourceId: 'resource', version: 1, pricingRevisionId: 'final', serviceCertificateId: 'certificate', serviceCertificateVersion: 1, terminalSourceHash: terminalRecognitionSourceHash(final), recognitionOn: new Date('2026-09-30'), amountMinor: 200000n, finalAmountMinor: 1400000n, serviceAmountMinor: 1200000n, coverage: 'COMPLETE', classification: 'Partida no servicio confirmada.', reason: 'Final confirmado.', recordedAt: new Date('2026-10-05T10:00:00Z') }];
    expect(await test.read()).toMatchObject({ serviceRevenueMinor: 600000, terminalRevenueMinor: 200000, revenueMinor: 800000, coverage: { complete: true } });
    test.state.current = { ...final, id: 'replacement', pricingRevisionId: 'replacement' };
    expect(await test.read()).toMatchObject({ terminalRevenueMinor: 0, contributionMinor: null, coverage: { pendingByReason: { TERMINAL_SOURCE_STALE: 1 } } });
  });
  it('reserva sin reconocimiento declara cobertura pendiente y ningún ingreso basado en precio/status', async () => {
    const test = fixture(); test.state.certificates = []; test.state.units = [];
    expect(await test.read()).toMatchObject({ revenueMinor: 0, contributionMinor: null, coverage: { pendingByReason: { SERVICE_NOT_CERTIFIED: 1 } } });
  });
  it('cero ingreso completo deja porcentaje null y contribución conocida cero', async () => {
    const test = fixture(); test.state.certificates = []; test.state.units = []; test.state.booking!.status = 'DRAFT';
    expect(await test.read()).toMatchObject({ revenueMinor: 0, contributionMinor: 0, contributionMarginBasisPoints: null, coverage: { complete: true } });
  });
  it('Booking ajena e inexistente dan el mismo404 de fuente sin leer costos ni historias', async () => {
    const test = fixture(); test.state.booking!.businessId = 'other';
    await expect(test.read()).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND', message: 'Reserva no disponible.' });
    test.state.booking = null;
    await expect(test.read()).rejects.toMatchObject({ code: 'SOURCE_NOT_FOUND', message: 'Reserva no disponible.' });
    expect(test.calls).toHaveLength(0);
  });
  it('asOf futuro falla antes de lectores y más5000 fuentes falla sin truncar', async () => {
    const test = fixture();
    await expect(test.read({ ...range, asOf: '2026-10-05T13:00:00.000Z' })).rejects.toMatchObject({ code: 'INVALID_SOURCE_CUT' });
    expect(test.readers.evidence).not.toHaveBeenCalled();
    test.state.costs = Array.from({ length: 5001 }, (_value, index) => ({ ...directCost(), lineId: `line-${index}` }));
    await expect(test.read()).rejects.toMatchObject({ code: 'SOURCE_LIMIT' });
  });
});
