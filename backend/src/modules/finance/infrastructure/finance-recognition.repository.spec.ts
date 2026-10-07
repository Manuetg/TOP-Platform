import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../business/business.contract';
import { FinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';
import type { FinanceActor } from '../domain/finance.types';
import type { CertifyServiceCommand } from '../domain/finance-recognition.types';
import { FINANCE_CLOSE_WRITERS } from '../domain/finance-close.rules';
import type { FinanceTerminalRecognitionCommand } from '../application/finance-recognition.operations';
import { PrismaFinanceRecognitionRepository } from './finance-recognition.repository';
import { PrismaFinanceCloseRepository } from './finance-close.repository';
import { recognitionHash, type RecognitionCertificateRow } from './finance-recognition.db';
import { mapServicePricingBasis, terminalRecognitionSourceHash } from './finance-recognition.source';
import * as report from './finance-recognition.report';
import { readFinanceRecognitionSources } from './finance-recognition.sources';
import * as loader from './finance-report.loader';
import * as mapper from './finance-report.mapper';
import type { FinanceCloseSupplementReader, FinanceRecognitionCostReader, FinanceRecognitionPublicReaders } from './finance-recognition.readers';

const ids = { business: '11111111-1111-4111-8111-111111111111', owner: '22222222-2222-4222-8222-222222222222', booking: '33333333-3333-4333-8333-333333333333', resource: '44444444-4444-4444-8444-444444444444', snapshot: '55555555-5555-4555-8555-555555555555', certificate: '66666666-6666-4666-8666-666666666666', final: '77777777-7777-4777-8777-777777777777', period: '88888888-8888-4888-8888-888888888888', closed: '99999999-9999-4999-8999-999999999999' };
const actor: FinanceActor = { businessId: ids.business, actorUserId: ids.owner };
const key = 'finance-recognition-request-001';
const updatedAt = '2026-10-05T00:00:00.000Z';
const date = (value: string) => new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
type ServicePrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>>>;
type CurrentPrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>>>;
function servicePrice(): ServicePrice {
  return { id: ids.snapshot, businessId: ids.business, bookingId: ids.booking, originalSnapshotId: ids.snapshot, pricingRevisionId: null, revisionNumber: 0, kind: 'SERVICE', sourceKind: 'SNAPSHOT', sourceContext: { checkInDate: '2026-09-01', checkOutDate: '2026-09-04', resourceIds: [ids.resource] }, currency: 'PYG', totalAmountMinor: 60, createdAt: date('2026-08-01'), items: [{ resourceId: ids.resource, ratePlanId: ids.snapshot, pricingMode: 'CALCULATED', agreedAmountMinor: 60, suggestedAmountMinor: 60, adjustmentAmountMinor: 0, overrideReason: null, nights: 3, breakdown: [{ date: '2026-09-01', amountMinor: 10, source: 'BASE' as ServicePrice['items'][number]['breakdown'][number]['source'] }, { date: '2026-09-02', amountMinor: 20, source: 'BASE' as ServicePrice['items'][number]['breakdown'][number]['source'] }, { date: '2026-09-03', amountMinor: 30, source: 'BASE' as ServicePrice['items'][number]['breakdown'][number]['source'] }] }] };
}
function finalPrice(amount = 40): CurrentPrice {
  return { ...servicePrice(), id: ids.final, kind: 'TERMINAL_FINAL_AMOUNT', pricingRevisionId: ids.final, revisionNumber: 1, totalAmountMinor: amount, items: [], sourceContext: { servicePricingId: ids.snapshot, finalAmountMinor: amount } };
}
function serviceCommand(): CertifyServiceCommand {
  return { bookingId: ids.booking, expectedBookingUpdatedAt: updatedAt, expectedCertificateVersion: 0, expectedPricingSourceId: ids.snapshot, supersedesCertificateId: null, effectiveCheckInOn: '2026-09-01', effectiveCheckOutOn: '2026-09-03', servedNights: ['2026-09-01', '2026-09-02'], evidence: 'Actas manuales de ingreso y salida.', reason: 'Prestación verificada por OWNER.' };
}
function certificateRow(): RecognitionCertificateRow & { headCertificateId: string; headVersion: number } {
  const pricing = mapServicePricingBasis(servicePrice());
  return { id: ids.certificate, headCertificateId: ids.certificate, headVersion: 1, businessId: ids.business, bookingId: ids.booking, resourceId: ids.resource, version: 1, supersedesCertificateId: null, originalSnapshotId: ids.snapshot, serviceRevisionId: null, sourceHash: pricing.sourceHash, bookingUpdatedAt: date(updatedAt), effectiveCheckInOn: date('2026-09-01'), effectiveCheckOutOn: date('2026-09-03'), checkInEventId: ids.owner, checkOutEventId: ids.owner, pricing: pricing as unknown as Prisma.JsonValue, policyVersion: 'BREAKDOWN_BY_DATE_V1', servicePolicyVersion: 'NIGHT_SERVICE_V1', evidence: 'Registro verificado.', reason: 'Prestado.', recordedByUserId: ids.owner, recordedAt: date('2026-10-01') };
}
function evidence() { return { businessId: ids.business, bookingId: ids.booking, resourceIds: [ids.resource], bookingUpdatedAt: updatedAt, checkInDate: '2026-09-01', checkOutDate: '2026-09-04', status: 'COMPLETED', checkInEventId: ids.owner, checkOutEventId: ids.owner }; }
function unitRows() { return [{ certificateId: ids.certificate, bookingId: ids.booking, localNight: date('2026-09-01'), amountMinor: 10n }, { certificateId: ids.certificate, bookingId: ids.booking, localNight: date('2026-09-02'), amountMinor: 20n }]; }
function terminalRow(on = '2026-09-02'): report.FinanceRecognitionTerminalRow {
  return { id: ids.final, bookingId: ids.booking, resourceId: ids.resource, version: 1, pricingRevisionId: ids.final, serviceCertificateId: ids.certificate, serviceCertificateVersion: 1, terminalSourceHash: terminalRecognitionSourceHash(finalPrice()), recognitionOn: date(on), amountMinor: 10n, finalAmountMinor: 40n, serviceAmountMinor: 30n, coverage: 'COMPLETE', classification: 'Cancelación; partida no servicio.', reason: 'Importe confirmado.', recordedAt: date('2026-10-01') };
}
function terminalCommand(): FinanceTerminalRecognitionCommand {
  return { bookingId: ids.booking, expectedBookingUpdatedAt: updatedAt, expectedVersion: 0, expectedPricingRevisionId: ids.final, serviceCertificateId: ids.certificate, serviceCertificateVersion: 1, recognitionOn: '2026-09-02', confirmedNonServiceAmountMinor: 10, coverage: 'COMPLETE', classification: 'Cancelación: partida no servicio.', reason: 'Verificación terminal explícita.' };
}
function periodRow(status = 'OPEN', version = 1) { return { id: ids.period, businessId: ids.business, from: date('2026-09-01'), to: date('2026-10-01'), timeZone: 'Etc/UTC', status, version, latestSnapshotId: status === 'CLOSED' ? ids.closed : null }; }

class FakeTransaction {
  calls: { sql: string; values: unknown[] }[] = [];
  role = 'OWNER'; userStatus = 'ACTIVE'; businessStatus = 'ACTIVE';
  prior: { fingerprint: string; result: unknown } | null = null;
  head: ReturnType<typeof certificateRow> | null = null;
  certificates: RecognitionCertificateRow[] = [];
  units = unitRows(); terminals: report.FinanceRecognitionTerminalRow[] = [];
  terminalVersions: { id: string; version: number; recognitionOn: Date }[] = [];
  now = date('2026-10-05T12:00:00.000Z'); guardError: Error | null = null; cas = 1;
  periods: ReturnType<typeof periodRow>[] = [periodRow()]; snapshot: unknown = null;
  writers: readonly string[] = FINANCE_CLOSE_WRITERS;
  resources = [{ id: ids.resource, name: 'Habitación histórica', status: 'ARCHIVED' }];
  readonly resource = { findMany: jest.fn(() => Promise.resolve(this.resources)) };
  private log(sql: Prisma.Sql | TemplateStringsArray, values: unknown[]) {
    const value = Array.isArray(sql) ? { sql: sql.join('?'), values } : sql as Prisma.Sql;
    this.calls.push({ sql: value.sql, values: [...value.values] }); return value.sql;
  }
  readonly $queryRaw = jest.fn((sql: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => Promise.resolve().then(() => {
    const text = this.log(sql, values);
    const result = this.readActorSources(text) ?? this.readRecognitionSources(text) ?? this.readCloseSources(text);
    if (result === undefined) throw new Error(`Unhandled read in fake transaction: ${text}`);
    return result;
  }));
  private readActorSources(text: string): unknown[] | undefined {
    if (text.includes('FROM "User"')) return [{ status: this.userStatus }];
    if (text.includes('FROM "UserBusinessMembership"')) return [{ role: this.role }];
    if (text.includes('FROM "Business"')) return [{ timezone: 'Etc/UTC', currency: 'PYG', status: this.businessStatus }];
    if (text.includes('FROM "Booking"')) return [{ id: ids.booking }];
    if (text.includes('FROM "FinanceRequest"')) return this.prior ? [this.prior] : [];
    if (text.includes('clock_timestamp() AS "asOf"')) return [{ asOf: this.now }];
    if (text.includes('FROM "FinanceServiceHead"')) return this.head ? [this.head] : [];
    return undefined;
  }
  private readRecognitionSources(text: string): unknown[] | undefined {
    if (text.includes('FROM "FinanceServiceCertificate"')) return this.certificates.map(row => ({ ...row, certifiedUnitCount: BigInt(this.units.filter(unit => unit.certificateId === row.id).length) }));
    if (text.includes('FROM "FinanceServiceUnit"')) return this.units;
    if (text.includes('FROM (SELECT DISTINCT ON ("bookingId") * FROM "FinanceTerminalRecognition"')) return this.terminals;
    if (text.startsWith('SELECT DISTINCT ON ("bookingId") * FROM "FinanceTerminalRecognition"')) return this.terminals;
    if (text.includes('FROM "FinanceTerminalRecognition"')) return this.terminalVersions;
    if (text.includes('JOIN "FinanceCloseSnapshot"')) return [];
    if (text.includes('FROM "FinancePeriod"') && text.includes('AND "from"=')) return [];
    return undefined;
  }
  private readCloseSources(text: string): unknown[] | undefined {
    if (text.includes('FROM "FinancePeriod"')) return this.periods;
    if (text.includes('FROM "FinanceCloseSnapshot"')) return this.snapshot ? [this.snapshot] : [];
    if (text.includes('FROM "FinanceCloseGuardEvidence"')) return this.writers.map(writer => ({ writer, installed: true }));
    if (text.includes('top_finance_assert_open')) { if (this.guardError) throw this.guardError; return []; }
    return undefined;
  }
  readonly $executeRaw = jest.fn((sql: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
    const text = this.log(sql, values); return Promise.resolve(text.startsWith('UPDATE "FinanceServiceHead"') || text.startsWith('INSERT INTO "FinanceServiceHead"') || text.startsWith('UPDATE "FinancePeriod"') ? this.cas : 1);
  });
  get tx() { return this as unknown as Prisma.TransactionClient; }
  get prisma() { return { $transaction: async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => work(this.tx) } as unknown as PrismaService; }
  get mutations() { return this.calls.filter(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql)); }
}
function dependencies() {
  const currentEvidence = evidence(); const service = servicePrice(); let current: CurrentPrice = service;
  const readers = {
    evidence: jest.fn<ReturnType<FinanceRecognitionPublicReaders['evidence']>, Parameters<FinanceRecognitionPublicReaders['evidence']>>(() => Promise.resolve(currentEvidence)), evidenceBatch: jest.fn<ReturnType<FinanceRecognitionPublicReaders['evidenceBatch']>, Parameters<FinanceRecognitionPublicReaders['evidenceBatch']>>(() => Promise.resolve(new Map([[ids.booking, currentEvidence]]))), candidates: jest.fn<ReturnType<FinanceRecognitionPublicReaders['candidates']>, Parameters<FinanceRecognitionPublicReaders['candidates']>>(() => Promise.resolve([currentEvidence])),
    servicePricing: jest.fn<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>, Parameters<FinanceRecognitionPublicReaders['servicePricing']>>(() => Promise.resolve(service)), servicePricingBatch: jest.fn<ReturnType<FinanceRecognitionPublicReaders['servicePricingBatch']>, Parameters<FinanceRecognitionPublicReaders['servicePricingBatch']>>(() => Promise.resolve(new Map([[ids.booking, service]]))), currentPricing: jest.fn<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>, Parameters<FinanceRecognitionPublicReaders['currentPricing']>>(() => Promise.resolve(current)), currentPricingBatch: jest.fn<ReturnType<FinanceRecognitionPublicReaders['currentPricingBatch']>, Parameters<FinanceRecognitionPublicReaders['currentPricingBatch']>>(() => Promise.resolve(new Map([[ids.booking, current]]))),
  };
  const costValue = { costSources: [] as Awaited<ReturnType<FinanceRecognitionCostReader['read']>>['costSources'], ownerWorkSources: [] as Awaited<ReturnType<FinanceRecognitionCostReader['read']>>['ownerWorkSources'], coverage: { unknownSourceIds: [] as string[], missingEvidenceSourceIds: [] as string[] }, token: 'c'.repeat(64) };
  const costs = { read: jest.fn<ReturnType<FinanceRecognitionCostReader['read']>, Parameters<FinanceRecognitionCostReader['read']>>(() => Promise.resolve(costValue)) };
  const supplementValue = { payload: { source: 'FinanceV2+Payment' }, sourceRefs: [], sourceToken: 'd'.repeat(64), sourceCount: 1, complete: true, missingSources: [] as string[] };
  const supplement = { read: jest.fn<ReturnType<FinanceCloseSupplementReader['read']>, Parameters<FinanceCloseSupplementReader['read']>>(() => Promise.resolve(supplementValue)) };
  return { readers, costs, supplement, supplementValue, costValue, currentEvidence, setCurrent: (price: CurrentPrice) => { current = price; } };
}

describe('Adaptadores D1/D2 con transacción simulada; sin evidencia DB', () => {
  let db: FakeTransaction; let deps: ReturnType<typeof dependencies>; let repository: PrismaFinanceRecognitionRepository;
  beforeEach(() => { db = new FakeTransaction(); deps = dependencies(); repository = new PrismaFinanceRecognitionRepository(db.prisma, deps.readers, deps.costs); });
  it('rechaza ADMIN antes de request, Booking y escrituras, incluido retry', async () => {
    db.role = 'ADMIN'; db.prior = { fingerprint: recognitionHash(serviceCommand()), result: { id: ids.certificate } };
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'FINANCE_FORBIDDEN' });
    expect(db.calls).toHaveLength(2); expect(db.mutations).toHaveLength(0);
  });
  it('certifica sólo evidencia manual y usa importes exactos por fecha con orden de locks', async () => {
    const result = await repository.certifyService(actor, serviceCommand(), key);
    expect(result.units).toEqual([{ localNight: '2026-09-01', amountMinor: 10 }, { localNight: '2026-09-02', amountMinor: 20 }]);
    expect(result.recordedByUserId).toBe(ids.owner); expect(result.pricing.totalAmountMinor).toBe(60);
    const index = (text: string) => db.calls.findIndex(call => call.sql.includes(text));
    expect(index('FROM "User"')).toBeLessThan(index('FROM "UserBusinessMembership"'));
    expect(index('FROM "UserBusinessMembership"')).toBeLessThan(index('FROM "Booking"'));
    expect(index('FROM "Booking"')).toBeLessThan(index('FROM "Business"'));
    expect(db.calls[index('FROM "Booking"')].sql).toContain('FOR UPDATE');
    expect(db.calls[index('FROM "Business"')].sql).toContain('FOR SHARE');
    expect(index('top_finance_assert_open')).toBeLessThan(index('INSERT INTO "FinanceRequest"'));
    expect(index('INSERT INTO "FinanceRequest"')).toBeLessThan(index('INSERT INTO "FinanceServiceCertificate"'));
    expect(index('INSERT INTO "FinanceServiceCertificate"')).toBeLessThan(index('INSERT INTO "FinanceServiceHead"'));
    expect(db.calls.at(-1)?.sql).toContain('INSERT INTO "FinanceAudit"');
  });
  it('no usa estado COMPLETED y fechas como evidencia de servicio', async () => {
    deps.currentEvidence.checkInEventId = null as unknown as string;
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'SERVICE_EVIDENCE_UNAVAILABLE' });
    expect(db.mutations).toHaveLength(0);
  });
  it('verifica CAS de Booking y certificado antes de cualquier inserción', async () => {
    await expect(repository.certifyService(actor, { ...serviceCommand(), expectedBookingUpdatedAt: '2026-10-04T00:00:00.000Z' }, key)).rejects.toMatchObject({ code: 'SOURCE_VERSION_CONFLICT' });
    db.calls = []; db.head = certificateRow();
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'CERTIFICATE_VERSION_CONFLICT' });
    expect(db.mutations).toHaveLength(0);
  });
  it('retry exacto usa resultado persistido, sin adquirir Booking ni escribir', async () => {
    const saved = { id: ids.certificate, units: [{ localNight: '2026-09-01', amountMinor: 10 }] };
    db.prior = { fingerprint: recognitionHash(serviceCommand()), result: saved };
    await expect(repository.certifyService(actor, serviceCommand(), key)).resolves.toEqual(saved);
    expect(db.calls.some(call => call.sql.includes('FROM "Booking"'))).toBe(false); expect(db.mutations).toHaveLength(0);
  });
  it('una misma clave con otra intención falla sin modificar hechos', async () => {
    db.prior = { fingerprint: 'other', result: {} };
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' }); expect(db.mutations).toHaveLength(0);
  });
  it('guardia DB cerrada bloquea antes de request/certificado/unidad/head/audit', async () => {
    db.guardError = new FinancePeriodClosedError();
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'FINANCE_PERIOD_CLOSED' }); expect(db.mutations).toHaveLength(0);
  });
  it('corrección declara ambas fechas y la referencia del certificado anterior', async () => {
    db.head = certificateRow();
    await repository.certifyService(actor, { ...serviceCommand(), expectedCertificateVersion: 1, supersedesCertificateId: ids.certificate, servedNights: ['2026-09-01'] }, key);
    const guard = db.calls.find(call => call.sql.includes('top_finance_assert_open'))!;
    expect(JSON.stringify(guard.values)).toContain('2026-09-02'); expect(guard.values).toContain(JSON.stringify([{ type: 'SERVICE_CERTIFICATE', id: ids.certificate }]));
    const cas = db.calls.find(call => call.sql.startsWith('UPDATE "FinanceServiceHead"'))!;
    expect(cas.values).toContain(ids.certificate); expect(cas.values).toContain(1);
  });
  it('reverso append-only conserva el precio certificado aunque el contexto actual dejó de servir', async () => {
    db.head = certificateRow(); deps.currentEvidence.status = 'NO_SHOW'; deps.currentEvidence.checkInDate = null as unknown as string;
    const result = await repository.certifyService(actor, { ...serviceCommand(), expectedCertificateVersion: 1, supersedesCertificateId: ids.certificate, servedNights: [] }, key);
    expect(result.version).toBe(2); expect(result.units).toEqual([]); expect(result.pricing.sourceHash).toBe(db.head.sourceHash);
    expect(deps.readers.servicePricing).not.toHaveBeenCalled(); expect(result.id).not.toBe(ids.certificate);
  });
  it('head corrupto falla cerrado; jamás parece un certificado inicial ausente', async () => {
    db.head = { ...certificateRow(), headVersion: 2 };
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'CERTIFICATE_HEAD_CONFLICT' }); expect(db.mutations).toHaveLength(0);
  });
  it('fallo CAS final rechaza la transacción iniciada por el adapter', async () => {
    db.cas = 0;
    await expect(repository.certifyService(actor, serviceCommand(), key)).rejects.toMatchObject({ code: 'CERTIFICATE_VERSION_CONFLICT' });
    expect(db.calls.some(call => call.sql.includes('INSERT INTO "FinanceAudit"'))).toBe(false);
  });
  it('D2 usa final persistido y suma servicio+residual una vez; no crea unidades', async () => {
    db.head = certificateRow(); deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice());
    await expect(repository.recognizeTerminal(actor, terminalCommand(), key)).resolves.toMatchObject({ finalAmountMinor: 40, serviceAmountMinor: 30, amountMinor: 10, version: 1, recordedByUserId: ids.owner });
    expect(db.mutations.some(call => call.sql.includes('FinanceServiceUnit'))).toBe(false);
  });
  it('final menor que servicio obliga corrección explícita', async () => {
    db.head = certificateRow(); deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice(20));
    await expect(repository.recognizeTerminal(actor, terminalCommand(), key)).rejects.toMatchObject({ code: 'TERMINAL_SERVICE_EXCEEDS_FINAL' }); expect(db.mutations).toHaveLength(0);
  });
  it('cambio terminal de precio, certificado o versión se rechaza antes de no-op/escritura', async () => {
    db.head = certificateRow(); deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice());
    await expect(repository.recognizeTerminal(actor, { ...terminalCommand(), expectedPricingRevisionId: ids.snapshot }, key)).rejects.toMatchObject({ code: 'TERMINAL_SOURCE_CONFLICT' });
    await expect(repository.recognizeTerminal(actor, { ...terminalCommand(), serviceCertificateVersion: 2 }, key)).rejects.toMatchObject({ code: 'CERTIFICATE_VERSION_CONFLICT' });
    await expect(repository.recognizeTerminal(actor, { ...terminalCommand(), expectedVersion: 1 }, key)).rejects.toMatchObject({ code: 'TERMINAL_VERSION_CONFLICT' }); expect(db.mutations).toHaveLength(0);
  });
  it('corrección terminal conserva referencia y fechas de la versión anterior en guardia', async () => {
    db.head = certificateRow(); deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice()); db.terminalVersions = [{ id: ids.closed, version: 1, recognitionOn: date('2026-08-31') }];
    await repository.recognizeTerminal(actor, { ...terminalCommand(), expectedVersion: 1 }, key);
    const guard = db.calls.find(call => call.sql.includes('top_finance_assert_open'))!;
    expect(JSON.stringify(guard.values)).toContain('2026-08-31'); expect(guard.values).toContain(JSON.stringify([{ type: 'TERMINAL_RECOGNITION', id: ids.closed }]));
  });
});

describe('Proyección de fuentes certificadas y costos; mismo corte y sin N+1', () => {
  let db: FakeTransaction; let deps: ReturnType<typeof dependencies>;
  const query = { from: '2026-09-01', to: '2026-10-01' };
  beforeEach(() => { db = new FakeTransaction(); deps = dependencies(); db.certificates = [certificateRow()]; });
  const read = (db: FakeTransaction, deps: ReturnType<typeof dependencies>, asOf = updatedAt) => report.readFinanceRecognitionProjection(db.tx, actor, query, 'Etc/UTC', asOf, deps.readers, deps.costs);
  it('recursos más sin asignar conservan negocio; trabajo propio queda antes/después separado', async () => {
    deps.costValue.costSources = [{ sourceId: `EXPENSE_LINE:${ids.owner}`, sourceVersion: 1, consumedOn: '2026-09-01', currency: 'PYG', amountMinor: 20, operational: true, basis: 'ACTUAL', allocations: [{ resourceId: ids.resource, amountMinor: 12 }, { resourceId: null, amountMinor: 8 }] }];
    deps.costValue.ownerWorkSources = [{ sourceId: `OWNER_IMPUTED:${ids.final}`, sourceVersion: 1, consumedOn: '2026-09-01', currency: 'PYG', amountMinor: 10, operational: true, basis: 'ESTIMATE', allocations: [{ resourceId: null, amountMinor: 10 }] }];
    const result = await read(db, deps);
    expect(result.totals).toMatchObject({ serviceRevenueMinor: 30, terminalRevenueMinor: 0, costMinor: 20, resultMinor: 10 });
    expect(result.rows.reduce((sum, row) => sum + row.resultMinor, 0)).toBe(result.totals.resultMinor);
    expect(result.afterOwnerWork.totals.resultMinor).toBe(0); expect(result.resources[0].active).toBe(false);
    expect(deps.readers.evidenceBatch).toHaveBeenCalledTimes(1); expect(deps.readers.servicePricing).not.toHaveBeenCalled();
    expect(deps.costs.read).toHaveBeenCalledWith(db.tx, { businessId: ids.business, ...query, asOf: updatedAt });
  });
  it('token estable frente a hora de lectura; cambiar la fuente invalida token', async () => {
    const one = await read(db, deps); const two = await read(db, deps, '2026-10-05T12:00:00.000Z'); expect(two.token).toBe(one.token); expect(two.asOf).not.toBe(one.asOf);
    db.units[0].amountMinor = 11n;
    await expect(report.readFinanceRecognitionProjection(db.tx, actor, { ...query, expectedSourceToken: one.token }, 'Etc/UTC', updatedAt, deps.readers, deps.costs)).rejects.toMatchObject({ code: 'SOURCE_TOKEN_CONFLICT' });
  });
  it('sin certificación declara cobertura incompleta e ingreso cero con margen null', async () => {
    db.certificates = []; const result = await read(db, deps);
    expect(result.totals.serviceRevenueMinor).toBe(0); expect(result.totals.marginBasisPoints).toBeNull(); expect(result.coverage.pendingByReason.SERVICE_NOT_CERTIFIED).toBe(1);
  });
  it('D2 reconoce sólo residual, además de noches efectivamente certificadas', async () => {
    deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice()); db.terminals = [terminalRow()];
    const result = await read(db, deps); expect(result.totals).toMatchObject({ serviceRevenueMinor: 30, terminalRevenueMinor: 10, resultMinor: 40 }); expect(result.coverage.complete).toBe(true);
  });
  it('certificado cambiado deja terminal stale excluido y cobertura incompleta', async () => {
    deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice()); db.terminals = [terminalRow()]; db.certificates[0].version = 2;
    const result = await read(db, deps); expect(result.totals.terminalRevenueMinor).toBe(0); expect(result.coverage.pendingByReason.TERMINAL_SOURCE_STALE).toBe(1); expect(result.totals.marginBasisPoints).toBeNull();
  });
  it('terminal clasificado fuera del rango no se suma ni vuelve a aparecer como faltante', async () => {
    deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice()); db.terminals = [terminalRow('2026-08-31')];
    const result = await read(db, deps); expect(result.totals.terminalRevenueMinor).toBe(0); expect(result.coverage.complete).toBe(true);
    expect(result.sourceRefs.some(source => source.type === 'TERMINAL_RECOGNITION' || source.type === 'TERMINAL_PRICING')).toBe(false);
    db.terminals[0].serviceCertificateVersion = 2;
    expect((await read(db, deps)).coverage.pendingByReason.TERMINAL_SOURCE_STALE).toBe(1);
  });
  it('precio SERVICE cambiado conserva monto certificado y advierte pendiente', async () => {
    jest.mocked(deps.readers.servicePricingBatch).mockResolvedValue(new Map()); const result = await read(db, deps);
    expect(result.totals.serviceRevenueMinor).toBe(30); expect(result.coverage.pendingByReason.CERTIFICATE_PRICING_STALE).toBe(1);
  });
  it('hueco dentro del tramo efectivo manual queda pendiente, sin fabricar ingreso ni redistribuir', async () => {
    db.units = [unitRows()[0]];
    const result = await read(db, deps); expect(result.totals.serviceRevenueMinor).toBe(10); expect(result.coverage.pendingByReason.SERVICE_NIGHT_NOT_CERTIFIED).toBe(1); expect(result.totals.marginBasisPoints).toBeNull();
    expect(result.pendingServiceNights).toEqual([{ sourceId: `SERVICE_CERTIFICATE:${ids.certificate}:2026-09-02`, sourceVersion: '1', bookingId: ids.booking, localNight: '2026-09-02', reason: 'SERVICE_NIGHT_NOT_CERTIFIED' }]);
  });
  it('salida efectiva temprana excluye noches no servidas y hoy se mantiene fuera del extremo exclusivo', async () => {
    db.certificates[0].effectiveCheckOutOn = date('2026-09-02'); db.units = [unitRows()[0]];
    expect((await read(db, deps)).coverage.complete).toBe(true);
    db.certificates[0].effectiveCheckOutOn = null; deps.currentEvidence.status = 'IN_PROGRESS';
    const result = await read(db, deps, '2026-09-02T12:00:00.000Z'); expect(result.coverage.complete).toBe(true); expect(result.pendingServiceNights).toEqual([]); expect(result.totals.serviceRevenueMinor).toBe(10);
  });
  it('reverso vacío explícito conserva ausencia de prestación; no fabrica huecos del tramo revocado', async () => {
    db.certificates[0].version = 2; db.certificates[0].supersedesCertificateId = ids.closed; db.units = [];
    const result = await read(db, deps); expect(result.totals.serviceRevenueMinor).toBe(0); expect(result.pendingServiceNights).toEqual([]); expect(result.coverage.complete).toBe(true);
  });
  it('exceso de fuentes y precios de otro tenant fallan cerrado', async () => {
    db.resources = Array.from({ length: 5001 }, (_, index) => ({ id: `r-${index}`, name: 'R', status: 'ACTIVE' }));
    await expect(read(db, deps)).rejects.toMatchObject({ code: 'SOURCE_LIMIT' }); expect(deps.readers.evidenceBatch).not.toHaveBeenCalled();
    db.resources = [{ id: ids.resource, name: 'R', status: 'ACTIVE' }]; deps.setCurrent({ ...servicePrice(), businessId: ids.owner });
    await expect(read(db, deps)).rejects.toMatchObject({ code: 'SOURCE_SCOPE_CONFLICT' });
  });
  it('residual corrupto y costos no conservados rechazan el resultado', async () => {
    deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice()); db.terminals = [{ ...terminalRow(), amountMinor: 11n }];
    await expect(read(db, deps)).rejects.toMatchObject({ code: 'TERMINAL_AMOUNT_CONFLICT' });
    db.terminals = []; deps.costValue.costSources = [{ sourceId: 'EXPENSE_LINE:x', sourceVersion: 1, consumedOn: '2026-09-01', currency: 'PYG', amountMinor: 20, operational: true, basis: 'ACTUAL', allocations: [{ resourceId: null, amountMinor: 19 }] }];
    await expect(read(db, deps)).rejects.toMatchObject({ code: 'COST_CONSERVATION_FAILED' });
  });
});

describe('Fuentes tipadas para selección manual; nunca certifica al consultar', () => {
  let db: FakeTransaction; let deps: ReturnType<typeof dependencies>;
  const query = { from: '2026-09-01', to: '2026-10-01' };
  beforeEach(() => { db = new FakeTransaction(); deps = dependencies(); });
  const read = (db: FakeTransaction, deps: ReturnType<typeof dependencies>, asOf = updatedAt) => readFinanceRecognitionSources(db.tx, actor, query, 'Etc/UTC', asOf, deps.readers);
  it('devuelve CAS, evidencia y mapa acordado completo sin generar certificado', async () => {
    const result = await read(db, deps); const source = result.sources[0];
    expect(source).toMatchObject({ bookingId: ids.booking, bookingUpdatedAt: updatedAt, currentCertificate: null, terminal: null, certificationBlockers: [] });
    expect(source.pricing?.sourceId).toBe(ids.snapshot); expect(source.agreedNights).toHaveLength(3); expect(source.eligibleNights).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']); expect(db.mutations).toHaveLength(0);
    expect(deps.readers.servicePricing).not.toHaveBeenCalled(); expect(deps.readers.servicePricingBatch).toHaveBeenCalledTimes(1);
  });
  it('noche del día actual y futuras nunca son elegibles aunque haya ingreso manual', async () => {
    const price = servicePrice(); price.sourceContext = { checkInDate: '2026-10-04', checkOutDate: '2026-10-07', resourceIds: [ids.resource] };
    price.items[0].breakdown = price.items[0].breakdown.map((night, index) => ({ ...night, date: `2026-10-0${index + 4}` }));
    deps.currentEvidence.checkInDate = '2026-10-04'; deps.currentEvidence.checkOutDate = '2026-10-07'; deps.currentEvidence.status = 'IN_PROGRESS'; deps.currentEvidence.checkOutEventId = null as unknown as string;
    jest.mocked(deps.readers.servicePricingBatch).mockResolvedValue(new Map([[ids.booking, price]]));
    expect((await read(db, deps)).sources[0].eligibleNights).toEqual(['2026-10-04']);
  });
  it('fecha/estado sin acta manual no produce selección elegible', async () => {
    deps.currentEvidence.checkInEventId = null as unknown as string;
    const source = (await read(db, deps)).sources[0]; expect(source.agreedNights).toHaveLength(3); expect(source.eligibleNights).toEqual([]); expect(source.certificationBlockers).toContain('SERVICE_EVIDENCE_UNAVAILABLE');
  });
  it('certificado completo y terminal conservan CAS aun fuera del rango visible de noches', async () => {
    db.certificates = [certificateRow()]; deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice()); db.terminals = [{ ...terminalRow(), version: 2 }];
    const source = (await read(db, deps)).sources[0];
    expect(source.currentCertificate?.units).toHaveLength(2); expect(source.terminal).toMatchObject({ pricingRevisionId: ids.final, expectedVersion: 2, serviceCertificateVersion: 1, serviceAmountMinor: 30, suggestedResidualMinor: 10, blockers: [], currentRecognition: { stale: false } });
    db.terminals[0].serviceCertificateVersion = 2;
    expect((await read(db, deps)).sources[0].terminal?.currentRecognition?.stale).toBe(true);
  });
  it('pesos cero positivos dejan causa explícita, sin mapa o tarifa inventada', async () => {
    const price = servicePrice(); price.totalAmountMinor = 5; price.items[0] = { ...price.items[0], pricingMode: 'MANUAL_OVERRIDE', agreedAmountMinor: 5, suggestedAmountMinor: 0, adjustmentAmountMinor: 5, overrideReason: 'Acuerdo manual.', breakdown: price.items[0].breakdown.map(night => ({ ...night, amountMinor: 0 })) } as typeof price.items[number];
    jest.mocked(deps.readers.servicePricingBatch).mockResolvedValue(new Map([[ids.booking, price]]));
    const source = (await read(db, deps)).sources[0]; expect(source.certificationBlockers).toContain('PRICING_WEIGHTS_UNAVAILABLE'); expect(source.agreedNights).toEqual([]); expect(source.eligibleNights).toEqual([]);
  });
  it('F menor que S expone bloqueo y residual null, jamás un cero fabricado', async () => {
    db.certificates = [certificateRow()]; deps.currentEvidence.status = 'CANCELLED'; deps.setCurrent(finalPrice(20));
    const source = (await read(db, deps)).sources[0]; expect(source.terminal?.suggestedResidualMinor).toBeNull(); expect(source.terminal?.blockers).toContain('TERMINAL_SERVICE_EXCEEDS_FINAL');
  });
  it('token estable salvo cambios reales y límite completo incluye mapas nocturnos', async () => {
    const one = await read(db, deps); expect((await read(db, deps, '2026-10-05T12:00:00.000Z')).token).toBe(one.token);
    await expect(readFinanceRecognitionSources(db.tx, actor, { ...query, expectedSourceToken: 'f'.repeat(64) }, 'Etc/UTC', updatedAt, deps.readers)).rejects.toMatchObject({ code: 'SOURCE_TOKEN_CONFLICT' });
    const price = servicePrice(); price.items[0].nights = 5001; jest.mocked(deps.readers.servicePricingBatch).mockResolvedValue(new Map([[ids.booking, price]]));
    await expect(read(db, deps)).rejects.toMatchObject({ code: 'SOURCE_LIMIT' });
  });
  it('lista vacía compara token y evita batches; repository revalida OWNER para lectura', async () => {
    jest.mocked(deps.readers.candidates).mockResolvedValue([]);
    await expect(readFinanceRecognitionSources(db.tx, actor, { ...query, expectedSourceToken: 'f'.repeat(64) }, 'Etc/UTC', updatedAt, deps.readers)).rejects.toMatchObject({ code: 'SOURCE_TOKEN_CONFLICT' }); expect(deps.readers.servicePricingBatch).not.toHaveBeenCalled();
    db.role = 'ADMIN'; const repository = new PrismaFinanceRecognitionRepository(db.prisma, deps.readers, deps.costs);
    await expect(repository.recognitionSources(actor, query)).rejects.toMatchObject({ code: 'FINANCE_FORBIDDEN' }); expect(db.mutations).toHaveLength(0);
  });
});

describe('Cierre y paquetes persistidos: adaptadores con fuentes simuladas', () => {
  let db: FakeTransaction; let deps: ReturnType<typeof dependencies>; let repository: PrismaFinanceCloseRepository;
  let registered: ReturnType<typeof mapper.mapFinanceReport>;
  beforeEach(() => {
    db = new FakeTransaction(); deps = dependencies(); repository = new PrismaFinanceCloseRepository(db.prisma, deps.readers, deps.costs, deps.supplement);
    jest.spyOn(loader, 'loadFinanceSources').mockResolvedValue({ bounds: { from: date('2026-09-01'), to: date('2026-10-01') }, payments: [], settlements: [], links: [], transfers: [], cashMovements: [], cashCounts: [], reviews: [] } as unknown as Awaited<ReturnType<typeof loader.loadFinanceSources>>);
    registered = { token: 'a'.repeat(64), expenses: [], payments: [], catalogs: [], accounts: [], resources: [], balanceSources: [], coverage: { unconfiguredAccountIds: [], missingEvidenceExpenseIds: [] }, movements: [], cashCounts: [] } as unknown as ReturnType<typeof mapper.mapFinanceReport>;
    jest.spyOn(mapper, 'mapFinanceReport').mockImplementation(() => registered);
    jest.spyOn(report, 'readFinanceRecognitionProjection').mockImplementation((_tx, _actor, _query, _tz, asOf) => Promise.resolve({ asOf, token: 'b'.repeat(64), sourceRefs: [], sourceCount: 0, coverage: { complete: true, pendingByReason: {} } } as unknown as Awaited<ReturnType<typeof report.readFinanceRecognitionProjection>>));
  });
  afterEach(() => { jest.restoreAllMocks(); });
  const closeInput = (sourceToken: string) => ({ expectedVersion: 1, expectedSourceToken: sourceToken, reason: 'Cierre revisado por OWNER.', acknowledgements: { ACCOUNT_OPENINGS: 'El negocio no tiene cuentas configuradas.' } });
  it('crea mes con motivo y locking Business UPDATE, sin locks Booking', async () => {
    await expect(repository.createPeriod(actor, { from: '2026-10-01', to: '2026-11-01', reason: 'Preparación mensual.' }, key)).resolves.toMatchObject({ status: 'OPEN', version: 1 });
    expect(db.calls.find(call => call.sql.includes('FROM "Business"'))?.sql).toContain('FOR UPDATE'); expect(db.calls.some(call => call.sql.includes('FROM "Booking"'))).toBe(false);
    expect(db.mutations.map(call => call.sql.split('(')[0])).toEqual(['INSERT INTO "FinancePeriod"', 'INSERT INTO "FinanceRequest"', 'INSERT INTO "FinanceAudit"']);
  });
  it('preparación y cierre usan mismo token estable y guardia exclusiva al cerrar', async () => {
    const prepared = await repository.prepareClose(actor, ids.period); db.now = date('2026-10-05T13:00:00.000Z');
    const result = await repository.closePeriod(actor, ids.period, closeInput(prepared.sourceToken), key);
    expect(result.period).toMatchObject({ status: 'CLOSED', version: 2 }); expect(result.snapshot?.sourceToken).toBe(prepared.sourceToken); expect(result.snapshot?.asOf).toBe('2026-10-05T13:00:00.000Z');
    const exclusiveIndex = db.calls.findIndex(call => call.sql.includes('FROM "Business"') && call.sql.includes('FOR UPDATE'));
    expect(exclusiveIndex).toBeGreaterThan(0); expect(db.calls.some(call => call.sql.includes('FROM "Booking"'))).toBe(false);
    const mutations = db.mutations.map(call => call.sql.split('(')[0]);
    expect(mutations[0]).toBe('INSERT INTO "FinanceRequest"'); expect(mutations[1]).toBe('INSERT INTO "FinanceCloseSnapshot"'); expect(mutations[2]).toContain('UPDATE "FinancePeriod"'); expect(mutations[3]).toBe('INSERT INTO "FinanceCloseEvent"');
  });
  it('fuentes suplementarias faltantes bloquean integridad aun con acknowledgement', async () => {
    deps.supplementValue.complete = false; deps.supplementValue.missingSources = ['Payment plan history'];
    const prepared = await repository.prepareClose(actor, ids.period);
    expect(prepared.checklist.find(item => item.key === 'SOURCES_COMPLETE')).toMatchObject({ passed: false, severity: 'BLOCKER', acknowledgement: null });
    await expect(repository.closePeriod(actor, ids.period, closeInput(prepared.sourceToken), key)).rejects.toMatchObject({ code: 'CLOSE_CHECKLIST_BLOCKED' }); expect(db.mutations).toHaveLength(0);
  });
  it('falta de cualquier escritor o lectura fallida de registry deshabilita cierre', async () => {
    db.writers = FINANCE_CLOSE_WRITERS.filter(writer => writer !== 'PAYMENT_REFUND'); const prepared = await repository.prepareClose(actor, ids.period);
    await expect(repository.closePeriod(actor, ids.period, closeInput(prepared.sourceToken), key)).rejects.toMatchObject({ code: 'CLOSE_WRITERS_UNGUARDED' }); expect(db.mutations).toHaveLength(0);
    db.$queryRaw.mockRejectedValueOnce(new Error('registry unavailable'));
    await expect(repository.prepareClose(actor, ids.period)).rejects.toThrow('registry unavailable');
  });
  it('diferencia de caja sigue explícita aunque haya un ajuste vinculado', async () => {
    registered.cashCounts = [{ differenceMinor: 5, adjustmentId: ids.final }] as typeof registered.cashCounts;
    const prepared = await repository.prepareClose(actor, ids.period); expect(prepared.checklist.find(item => item.key === 'CASH_COUNTS')?.passed).toBe(false);
    await expect(repository.closePeriod(actor, ids.period, closeInput(prepared.sourceToken), key)).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' }); expect(db.mutations).toHaveLength(0);
  });
  it('guardrefs usan sólo pagos/aperturas/links/reviews que afectan el corte y catálogos versionados', async () => {
    const loaded = await loader.loadFinanceSources(db.tx, ids.business, '2026-09-01', '2026-10-01', 'Etc/UTC');
    loaded.payments = [{ id: 'old-payment', paymentVersion: 1, bookingId: 'old', amountMinor: 20, currency: 'PYG', paidAt: '2026-08-31T12:00:00.000Z', reference: null }, { id: 'future-payment', paymentVersion: 1, bookingId: 'future', amountMinor: 50, currency: 'PYG', paidAt: '2026-10-01T12:00:00.000Z', reference: null }];
    loaded.links = [{ id: 'old-link', paymentId: 'old-payment', version: 1 }, { id: 'future-link', paymentId: 'future-payment', version: 1 }] as typeof loaded.links;
    loaded.reviews = [{ id: 'future-review', sourceType: 'PAYMENT', sourceId: 'future-payment', version: 1 }] as typeof loaded.reviews;
    registered.catalogs = [{ id: 'catalog', kind: 'CATEGORY', name: 'Operación', archived: false, version: 3 }];
    registered.accounts = [{ id: 'future-account', version: 1, opening: { id: 'future-opening', occurredAt: '2026-10-01T12:00:00.000Z' } }] as typeof registered.accounts;
    const prepared = await repository.prepareClose(actor, ids.period); const refIds = prepared.sourceRefs.map(source => source.id);
    expect(refIds).toEqual(expect.arrayContaining(['old-payment', 'old-link', 'catalog']));
    expect(refIds).not.toEqual(expect.arrayContaining(['future-payment'])); expect(refIds).not.toEqual(expect.arrayContaining(['future-link'])); expect(refIds).not.toEqual(expect.arrayContaining(['future-opening'])); expect(refIds).not.toEqual(expect.arrayContaining(['future-review']));
  });
  it('CAS desactualizado se rechaza antes de releer fuentes o escribir', async () => {
    await expect(repository.closePeriod(actor, ids.period, { ...closeInput('f'.repeat(64)), expectedVersion: 2 }, key)).rejects.toMatchObject({ code: 'CLOSE_VERSION_CONFLICT' }); expect(deps.supplement.read).not.toHaveBeenCalled(); expect(db.mutations).toHaveLength(0);
  });
  it('reapertura conserva snapshot y agrega evento/version/motivo sin reemplazar paquete', async () => {
    db.periods = [periodRow('CLOSED', 2)];
    const result = await repository.reopenPeriod(actor, ids.period, { expectedVersion: 2, reason: 'Corregir prestación certificada.' }, key);
    expect(result.period).toMatchObject({ status: 'OPEN', version: 3, latestSnapshotId: ids.closed }); expect(result.snapshot).toBeNull(); expect(result.event.snapshotId).toBe(ids.closed); expect(deps.supplement.read).not.toHaveBeenCalled();
    expect(db.mutations.some(call => call.sql.includes('INSERT INTO "FinanceCloseSnapshot"'))).toBe(false);
  });
  it('paquete actual/histórico lee payload persistido, verifica hash y no recalcula fuentes', async () => {
    db.periods = [{ ...periodRow('OPEN', 3), latestSnapshotId: ids.closed }];
    const payload = { persisted: true, originalDifferenceMinor: 5 };
    db.snapshot = { id: ids.closed, businessId: ids.business, periodId: ids.period, closeVersion: 2, previousSnapshotId: null, asOf: date('2026-10-01'), sourceToken: 'e'.repeat(64), policyVersion: 'BLOCK_CLOSED_PERIOD_V1', policyVersions: {}, payload, payloadHash: recognitionHash(payload), sourceRefs: [], checklist: [], recordedByUserId: ids.owner, recordedAt: date('2026-10-01') };
    await expect(repository.readSnapshot(actor, ids.period)).resolves.toMatchObject({ payload, closeVersion: 2 });
    await repository.readSnapshot(actor, ids.period, ids.closed);
    expect(deps.supplement.read).not.toHaveBeenCalled(); expect(loader.loadFinanceSources).not.toHaveBeenCalled();
    const readCall = db.calls.find(call => call.sql.includes('FROM "FinanceCloseSnapshot"'))!; expect(readCall.values).toContain(ids.business); expect(readCall.values).toContain(ids.period);
    (db.snapshot as { payloadHash: string }).payloadHash = 'f'.repeat(64);
    await expect(repository.readSnapshot(actor, ids.period)).rejects.toMatchObject({ code: 'CLOSE_SNAPSHOT_CONFLICT' });
  });
});
