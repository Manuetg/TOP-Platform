import { recognitionDate, recognitionInstant, recognitionRequire, recognitionText, recognitionVersion } from './finance-recognition.support';
import type { CloseJson, ClosedFinancialPeriod, FinanceCloseEvent, FinanceCloseSnapshot, FinanceCloseSources, FinancePeriod, FinanceWriteImpact } from './finance-close.types';

export const FINANCE_CLOSE_WRITERS = [
  'PAYMENT_REGISTER', 'PAYMENT_VOID', 'PAYMENT_REFUND', 'PAYMENT_PLAN', 'PAYMENT_APPLICATION',
  'PRICING_SNAPSHOT', 'PRICING_SERVICE_REVISION', 'PRICING_TERMINAL_FINAL_AMOUNT', 'BOOKING_AMENDMENT',
  'SERVICE_CERTIFICATE', 'TERMINAL_RECOGNITION', 'EXPENSE', 'EXPENSE_LINE', 'EXPENSE_CORRECTION', 'EXPENSE_EVIDENCE',
  'SETTLEMENT', 'ACCOUNT_OPENING', 'PAYMENT_ACCOUNT_LINK', 'TRANSFER', 'CASH_MOVEMENT', 'CASH_COUNT', 'MOVEMENT_REVIEW',
  'COST_ALLOCATION', 'LABOR_COST', 'BUDGET', 'COMMITMENT', 'COMMITMENT_CONVERSION',
  'BOOKING_FINANCIAL_CONTEXT', 'RESOURCE_FINANCIAL_CONTEXT', 'DIRECT_SQL_IMPORT',
  'BANK_STATEMENT', 'BANK_IMPORT', 'BANK_MATCH', 'COST_RULE', 'EXPENSE_DRAFT',
  'EXPENSE_TEMPLATE', 'APPROVAL_POLICY', 'CATALOG', 'ACCOUNT', 'IMPORT_HISTORY',
] as const;
const REQUIRED_CHECKLIST = [
  'SOURCES_COMPLETE', 'COMMON_CUT', 'PYG_SAFE', 'COST_CONSERVATION', 'RECOGNITION_COVERAGE',
  'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS',
] as const;
const BLOCKING_CHECKLIST = ['SOURCES_COMPLETE', 'COMMON_CUT', 'PYG_SAFE', 'COST_CONSERVATION'];

export function assertMonthlyPeriod(period: FinancePeriod, localToday: string): void {
  recognitionDate(period.from); recognitionDate(period.to); recognitionDate(localToday); recognitionVersion(period.version, 1);
  const next = new Date(`${period.from}T00:00:00.000Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  recognitionRequire(period.from.endsWith('-01') && next.toISOString().slice(0, 10) === period.to, 'INVALID_MONTHLY_PERIOD', 'El cierre abarca exactamente un mes local.');
  recognitionRequire(period.to <= localToday, 'PERIOD_NOT_FINISHED', 'Sólo puede cerrarse un mes que ya terminó.');
  try { new Intl.DateTimeFormat('es', { timeZone: period.timeZone }).format(new Date()); }
  catch { recognitionRequire(false, 'INVALID_TIME_ZONE', 'La zona horaria IANA no es válida.'); }
}

export function assertFinanceWriteOpen(impact: FinanceWriteImpact, periods: readonly ClosedFinancialPeriod[]): void {
  recognitionRequire(impact.complete && FINANCE_CLOSE_WRITERS.includes(impact.writer as typeof FINANCE_CLOSE_WRITERS[number]), 'FINANCIAL_IMPACT_INCOMPLETE', 'La guardia debe conocer todo el impacto del escritor.');
  for (const date of impact.affectedDates) recognitionDate(date);
  for (const closed of periods) {
    const { period } = closed;
    recognitionRequire(period.businessId === impact.businessId, 'SOURCE_SCOPE_MISMATCH', 'La guardia no puede usar períodos de otro Negocio.');
    if (period.status !== 'CLOSED') continue;
    const datesTouch = impact.affectedDates.some(date => period.from <= date && date < period.to);
    const sourceTouches = impact.changedSourceRefs.some(changed => closed.sourceRefs.some(source => source.type === changed.type && source.id === changed.id));
    recognitionRequire(!datesTouch && !sourceTouches, 'FINANCE_PERIOD_CLOSED', 'El hecho financiero pertenece a un período cerrado; OWNER debe reabrirlo con motivo.');
  }
}

type FinanceCloseInput = { id: string; eventId: string; period: FinancePeriod; expectedVersion: number; expectedSourceToken: string; sources: FinanceCloseSources; localToday: string; actorUserId: string; recordedAt: string; reason: string };
export function planFinanceClose(input: FinanceCloseInput): { period: FinancePeriod; snapshot: FinanceCloseSnapshot; event: FinanceCloseEvent } {
  const { period, sources } = input;
  assertMonthlyPeriod(period, input.localToday); recognitionInstant(input.recordedAt); recognitionInstant(sources.asOf);
  recognitionVersion(input.expectedVersion, 1);
  assertCloseIdentity(input);
  assertCloseChecklist(sources);
  assertCloseJson(sources.payload);
  assertCloseSourceRefs(sources);
  const version = recognitionVersion(period.version + 1, 1); const reason = recognitionText(input.reason);
  const snapshot = freezeCloseValue<FinanceCloseSnapshot>({ id: input.id, businessId: period.businessId, periodId: period.id, closeVersion: version, previousSnapshotId: period.latestSnapshotId, asOf: sources.asOf, sourceToken: sources.sourceToken, policyVersion: 'BLOCK_CLOSED_PERIOD_V1', policyVersions: { ...sources.policyVersions }, payload: structuredClone(sources.payload), payloadHash: sources.payloadHash, sourceRefs: structuredClone(sources.sourceRefs), checklist: structuredClone(sources.checklist), recordedByUserId: input.actorUserId, recordedAt: input.recordedAt });
  return { period: { ...period, status: 'CLOSED', version, latestSnapshotId: snapshot.id }, snapshot, event: { id: input.eventId, businessId: period.businessId, periodId: period.id, type: 'CLOSE', beforeVersion: period.version, afterVersion: version, snapshotId: snapshot.id, reason, actorUserId: input.actorUserId, occurredAt: input.recordedAt } };
}

export function planFinanceReopen(input: { eventId: string; period: FinancePeriod; expectedVersion: number; actorUserId: string; recordedAt: string; reason: string }): { period: FinancePeriod; event: FinanceCloseEvent } {
  recognitionInstant(input.recordedAt); recognitionVersion(input.expectedVersion, 1);
  recognitionRequire(input.period.status === 'CLOSED' && input.period.version === input.expectedVersion && input.period.latestSnapshotId, 'CLOSE_VERSION_CONFLICT', 'La reapertura requiere versión vigente y snapshot cerrado.');
  const reason = recognitionText(input.reason); const version = recognitionVersion(input.period.version + 1, 1);
  return { period: { ...input.period, status: 'OPEN', version }, event: { id: input.eventId, businessId: input.period.businessId, periodId: input.period.id, type: 'REOPEN', beforeVersion: input.period.version, afterVersion: version, snapshotId: input.period.latestSnapshotId, reason, actorUserId: input.actorUserId, occurredAt: input.recordedAt } };
}

function assertCloseJson(value: CloseJson): void {
  if (typeof value === 'number') recognitionRequire(Number.isSafeInteger(value), 'CLOSE_PAYLOAD_INVALID', 'El payload no admite números inseguros o fracciones.');
  else if (Array.isArray(value)) for (const item of value) assertCloseJson(item);
  else if (value !== null && typeof value === 'object') {
    recognitionRequire(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'CLOSE_PAYLOAD_INVALID', 'El payload debe ser JSON simple.');
    for (const item of Object.values(value)) assertCloseJson(item);
  } else recognitionRequire(value === null || ['string', 'boolean'].includes(typeof value), 'CLOSE_PAYLOAD_INVALID', 'El payload debe ser JSON definido.');
}
function freezeCloseValue<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeCloseValue(child);
    Object.freeze(value);
  }
  return value;
}

function assertCloseIdentity(input: FinanceCloseInput): void {
  const { period, sources } = input;
  recognitionRequire(period.status === 'OPEN' && period.version === input.expectedVersion, 'CLOSE_VERSION_CONFLICT', 'El período cambió o ya está cerrado.');
  recognitionRequire(input.id.length > 0 && input.id !== period.latestSnapshotId, 'CLOSE_SNAPSHOT_ID_CONFLICT', 'Un recierre debe crear un snapshot nuevo.');
  recognitionRequire(sources.businessId === period.businessId && sources.from === period.from && sources.to === period.to && sources.timeZone === period.timeZone, 'SOURCE_SCOPE_MISMATCH', 'El corte debe corresponder al Negocio, período y timezone.');
  recognitionRequire(sources.sourceToken.length > 0 && sources.sourceToken === input.expectedSourceToken && sources.payloadHash.length > 0 && sources.asOf <= input.recordedAt, 'CLOSE_SOURCE_CONFLICT', 'El token/corte cambió o no tiene hash verificable.');
}
function assertCloseChecklist(sources: FinanceCloseSources): void {
  const guarded = new Set(sources.guardedWriters);
  recognitionRequire(FINANCE_CLOSE_WRITERS.every(writer => guarded.has(writer)), 'CLOSE_WRITERS_UNGUARDED', 'El cierre permanece deshabilitado hasta proteger todos los escritores y SQL directo.');
  const checklist = new Map(sources.checklist.map(item => [item.key, item]));
  recognitionRequire(checklist.size === sources.checklist.length && REQUIRED_CHECKLIST.every(key => checklist.has(key)), 'CLOSE_CHECKLIST_INCOMPLETE', 'El checklist debe contener cada control exactamente una vez.');
  for (const item of sources.checklist) {
    recognitionRequire(!BLOCKING_CHECKLIST.includes(item.key) || item.severity === 'BLOCKER', 'CLOSE_CHECKLIST_INVALID', 'Los controles de integridad siempre son bloqueantes.');
    recognitionRequire(typeof item.passed === 'boolean' && ['BLOCKER', 'EXCEPTION'].includes(item.severity), 'CLOSE_CHECKLIST_INVALID', 'El control debe declarar resultado y severidad.');
    if (!item.passed) {
      recognitionRequire(item.severity === 'EXCEPTION', 'CLOSE_CHECKLIST_BLOCKED', 'Un error de integridad bloquea el cierre.');
      recognitionText(item.acknowledgement ?? '');
    }
  }
}
function assertCloseSourceRefs(sources: FinanceCloseSources): void {
  const seen = new Set<string>();
  for (const source of sources.sourceRefs) {
    recognitionRequire(source.type.length > 0 && source.id.length > 0 && source.version.length > 0 && !seen.has(`${source.type}:${source.id}`), 'CLOSE_SOURCE_INVALID', 'Las referencias fijan una versión por fuente.');
    seen.add(`${source.type}:${source.id}`);
  }
}
