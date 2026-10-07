import type { CloseJson, FinanceCloseSnapshot } from '../domain/finance-close.types';
import { recognitionDate, recognitionRequire } from '../domain/finance-recognition.support';

export interface FinanceClosePackage {
  period: { from: string; to: string; timeZone: string };
  snapshot: FinanceCloseSnapshot;
  detailsCsv: string;
  alerts: readonly { code: string; count: number; acknowledgement: string | null }[];
  debtBasis: 'OBSERVED_AT_AS_OF'; unknownHistoricalDebt: true;
}
type JsonRecord = { [key: string]: CloseJson };
function record(value: CloseJson | undefined): JsonRecord {
  recognitionRequire(value !== null && typeof value === 'object' && !Array.isArray(value), 'CLOSE_PACKAGE_SOURCE_CONFLICT', 'El paquete requiere las fuentes JSON guardadas.');
  return value;
}
function rows(value: CloseJson | undefined): JsonRecord[] {
  recognitionRequire(Array.isArray(value), 'CLOSE_PACKAGE_SOURCE_CONFLICT', 'El detalle guardado requiere una lista completa.');
  return value.map(record);
}
function text(value: CloseJson | undefined): string { recognitionRequire(typeof value === 'string', 'CLOSE_PACKAGE_SOURCE_CONFLICT', 'La fuente guardada requiere texto.'); return value; }
function number(value: CloseJson | undefined): number { recognitionRequire(typeof value === 'number' && Number.isSafeInteger(value), 'CLOSE_PACKAGE_SOURCE_CONFLICT', 'La fuente guardada requiere PYG entero seguro.'); return value; }
function csv(value: string | number | boolean | null): string {
  let rendered = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(rendered)) rendered = `'${rendered}`;
  return `"${rendered.replace(/"/g, '""')}"`;
}
/** Exporta el snapshot seleccionado; no consulta ni recalcula el estado vigente. */
export function buildFinanceClosePackage(snapshot: FinanceCloseSnapshot): FinanceClosePackage {
  const payload = record(snapshot.payload); const profitability = record(payload.profitability); const registered = record(payload.registeredOperations);
  const from = text(profitability.from); const to = text(profitability.to); const timeZone = text(profitability.timeZone); recognitionDate(from); recognitionDate(to);
  recognitionRequire(from < to && payload.debtBasis === 'OBSERVED_AT_AS_OF' && payload.unknownHistoricalDebt === true, 'CLOSE_PACKAGE_SOURCE_CONFLICT', 'El paquete conserva período y base de deuda explícitos.');
  const detail: DetailRow[] = [];
  const inMonth = (value: string) => value >= from && value < to;
  appendServiceRows(detail, profitability, inMonth);
  appendTerminalRows(detail, profitability, inMonth);
  appendCostRows(detail, profitability, inMonth);
  appendBalanceRows(detail, registered, timeZone, to);
  recognitionRequire(detail.length <= 5000, 'SOURCE_LIMIT', 'El paquete no trunca filas del detalle.');
  detail.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const header = ['row_type', 'local_date', 'booking_id', 'resource_id', 'source_id', 'source_version', 'amount_minor', 'currency', 'basis', 'included_in_result', 'classification', 'snapshot_id', 'source_token', 'as_of'];
  const detailsCsv = [header.map(csv).join(','), ...detail.map(row => [...row, snapshot.id, snapshot.sourceToken, snapshot.asOf].map(csv).join(','))].join('\r\n') + '\r\n';
  const alerts = snapshot.checklist.filter(item => !item.passed).map(item => ({ code: `CHECKLIST:${item.key}`, count: 1, acknowledgement: item.acknowledgement }));
  const pending = record(record(profitability.coverage).pendingByReason);
  for (const [reason, count] of Object.entries(pending)) { const amount = number(count); if (amount > 0) alerts.push({ code: `RECOGNITION:${reason}`, count: amount, acknowledgement: null }); }
  return { period: { from, to, timeZone }, snapshot, detailsCsv, alerts, debtBasis: 'OBSERVED_AT_AS_OF', unknownHistoricalDebt: true };
}

type DetailRow = (string | number | boolean | null)[];
function appendServiceRows(detail: DetailRow[], profitability: JsonRecord, inMonth: (value: string) => boolean): void {
  for (const unit of rows(profitability.units)) if (inMonth(text(unit.localNight))) detail.push(['SERVICE_REVENUE', text(unit.localNight), text(unit.bookingId), text(unit.resourceId), text(unit.certificateId), number(unit.certificateVersion), number(unit.amountMinor), 'PYG', 'CERTIFIED_SERVICE', true, null]);
}
function appendTerminalRows(detail: DetailRow[], profitability: JsonRecord, inMonth: (value: string) => boolean): void {
  for (const terminal of rows(profitability.terminalEntries)) if (inMonth(text(terminal.recognitionOn))) detail.push(['TERMINAL_NON_SERVICE', text(terminal.recognitionOn), text(terminal.bookingId), terminal.resourceId === null ? null : text(terminal.resourceId), text(terminal.id), number(terminal.version), number(terminal.amountMinor), 'PYG', 'CONFIRMED_NON_SERVICE', terminal.stale === false, text(terminal.classification)]);
}
function appendCostRows(detail: DetailRow[], profitability: JsonRecord, inMonth: (value: string) => boolean): void {
  for (const [kind, field] of [['OPERATING_COST', 'costSources'], ['OWNER_WORK_ESTIMATE', 'ownerWorkSources']] as const) for (const source of rows(profitability[field])) if (inMonth(text(source.consumedOn))) {
    for (const part of rows(source.allocations)) detail.push([kind, text(source.consumedOn), null, part.resourceId === null ? null : text(part.resourceId), text(source.sourceId), number(source.sourceVersion), number(part.amountMinor), 'PYG', text(source.basis), source.operational === true, null]);
  }
}
function appendBalanceRows(detail: DetailRow[], registered: JsonRecord, timeZone: string, to: string): void {
  for (const movement of rows(registered.balanceSources)) {
    const occurredAt = text(movement.occurredAt); const parsed = new Date(occurredAt);
    recognitionRequire(Number.isFinite(parsed.getTime()), 'CLOSE_PACKAGE_SOURCE_CONFLICT', 'El movimiento guardado conserva su instante.');
    const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
    if (localDate < to) detail.push(['REGISTERED_BALANCE_SOURCE', localDate, typeof movement.bookingId === 'string' ? movement.bookingId : null, null, text(movement.sourceId), number(movement.sourceVersion), number(movement.amountMinor), 'PYG', 'REGISTERED_BALANCE', movement.includedInBalance === true, text(movement.description)]);
  }
}
