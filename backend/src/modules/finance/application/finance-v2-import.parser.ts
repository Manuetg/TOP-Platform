import { sumMoney } from '../domain/finance-money';
import { parseBoundedCsv } from './finance-v2-bounded-csv';
import { evidenceBoolean, evidenceDate, evidenceDigest, evidenceInstant, evidenceMoney, evidenceText, evidenceUuid, FinanceEvidenceError, issue, optional } from './finance-v2-evidence.validation';
import type { HistoryExpense, HistoryExpenseLine, HistoryParsedRow, HistoryParseResult, HistorySettlement, HistorySource } from './finance-v2-import.types';

export const HISTORY_CSV_HEADER = ['rowKind', 'rowKey', 'documentKey', 'accountId', 'expenseId', 'expenseDocumentKey', 'description', 'consumedOn', 'dueOn', 'counterpartyId', 'reference', 'documentAmountMinor', 'lineOrdinal', 'label', 'categoryId', 'resourceId', 'bookingId', 'lineAmountMinor', 'operational', 'amountMinor', 'occurredAt', 'reason', 'includedInOpening'] as const;
type RecordRow = Record<(typeof HISTORY_CSV_HEADER)[number], string>;
const COMMON = ['rowKind', 'rowKey'];
const FIELDS = {
  OPENING: [...COMMON, 'accountId', 'amountMinor', 'occurredAt', 'reason'],
  EXPENSE_LINE: [...COMMON, 'documentKey', 'description', 'consumedOn', 'dueOn', 'counterpartyId', 'reference', 'documentAmountMinor', 'lineOrdinal', 'label', 'categoryId', 'resourceId', 'bookingId', 'lineAmountMinor', 'operational'],
  SETTLEMENT: [...COMMON, 'accountId', 'expenseId', 'expenseDocumentKey', 'amountMinor', 'occurredAt', 'reference', 'includedInOpening'],
};
function uuidOrNull(value: string, column: string): string | null { return optional(value, text => evidenceUuid(text, column)); }
function textOrNull(value: string, column: string, max: number): string | null { return optional(value, text => evidenceText(text, column, max)); }
function expenseLine(row: RecordRow): HistoryExpenseLine {
  const ordinal = evidenceMoney(row.lineOrdinal, 'lineOrdinal', 1);
  if (ordinal > 50) throw new FinanceEvidenceError('LINE_ORDINAL_INVALID', 'lineOrdinal');
  return { rowKey: evidenceText(row.rowKey, 'rowKey', 120), ordinal, label: evidenceText(row.label, 'label', 120), categoryId: evidenceUuid(row.categoryId, 'categoryId'), resourceId: uuidOrNull(row.resourceId, 'resourceId'), bookingId: uuidOrNull(row.bookingId, 'bookingId'), amountMinor: evidenceMoney(row.lineAmountMinor, 'lineAmountMinor', 1), operational: evidenceBoolean(row.operational, 'operational') };
}
function expense(row: RecordRow): HistoryExpense {
  const line = expenseLine(row);
  return { kind: 'EXPENSE', externalKey: evidenceText(row.documentKey, 'documentKey', 120), rowKeys: [line.rowKey], description: evidenceText(row.description, 'description', 240), consumedOn: evidenceDate(row.consumedOn, 'consumedOn'), dueOn: optional(row.dueOn, text => evidenceDate(text, 'dueOn')), counterpartyId: uuidOrNull(row.counterpartyId, 'counterpartyId'), reference: textOrNull(row.reference, 'reference', 500), amountMinor: evidenceMoney(row.documentAmountMinor, 'documentAmountMinor', 1), lines: [line] };
}
function settlement(row: RecordRow, externalKey: string): HistorySettlement {
  const expenseId = uuidOrNull(row.expenseId, 'expenseId');
  const expenseDocumentKey = textOrNull(row.expenseDocumentKey, 'expenseDocumentKey', 120);
  if ((expenseId === null) === (expenseDocumentKey === null)) throw new FinanceEvidenceError('EXPENSE_REFERENCE_XOR', 'expenseId');
  return { kind: 'SETTLEMENT', externalKey, rowKeys: [externalKey], accountId: evidenceUuid(row.accountId, 'accountId'), expenseId, expenseDocumentKey, amountMinor: evidenceMoney(row.amountMinor, 'amountMinor', 1), occurredAt: evidenceInstant(row.occurredAt, 'occurredAt'), reference: textOrNull(row.reference, 'reference', 500), includedInOpening: evidenceBoolean(row.includedInOpening, 'includedInOpening') };
}
function parseRow(values: string[]): HistorySource {
  const row = Object.fromEntries(HISTORY_CSV_HEADER.map((key, index) => [key, values[index]])) as RecordRow;
  const kind = row.rowKind;
  if (kind !== 'OPENING' && kind !== 'EXPENSE_LINE' && kind !== 'SETTLEMENT') throw new FinanceEvidenceError('ROW_KIND_INVALID', 'rowKind');
  const unexpected = HISTORY_CSV_HEADER.find(key => !FIELDS[kind].includes(key) && row[key] !== '');
  if (unexpected) throw new FinanceEvidenceError('INAPPLICABLE_COLUMN', unexpected);
  const externalKey = evidenceText(row.rowKey, 'rowKey', 120);
  if (kind === 'EXPENSE_LINE') return expense(row);
  if (kind === 'SETTLEMENT') return settlement(row, externalKey);
  return { kind, externalKey, rowKeys: [externalKey], accountId: evidenceUuid(row.accountId, 'accountId'), amountMinor: evidenceMoney(row.amountMinor, 'amountMinor', -Number.MAX_SAFE_INTEGER), occurredAt: evidenceInstant(row.occurredAt, 'occurredAt'), reason: evidenceText(row.reason, 'reason', 500) };
}
function metadata(source: HistoryExpense): string {
  return evidenceDigest({ kind: source.kind, externalKey: source.externalKey, description: source.description, consumedOn: source.consumedOn, dueOn: source.dueOn, counterpartyId: source.counterpartyId, reference: source.reference, amountMinor: source.amountMinor });
}
function collectSources(rows: HistoryParsedRow[]): HistorySource[] {
  const grouped = new Map<string, HistorySource>();
  for (const { source } of rows) {
    const previous = grouped.get(source.externalKey);
    if (!previous) { grouped.set(source.externalKey, source.kind === 'EXPENSE' ? { ...source, rowKeys: [...source.rowKeys], lines: [...source.lines] } : source); continue; }
    if (source.kind !== 'EXPENSE' || previous.kind !== 'EXPENSE') throw new FinanceEvidenceError('SOURCE_KEY_DUPLICATE', 'rowKey');
    if (metadata(previous) !== metadata(source)) throw new FinanceEvidenceError('DOCUMENT_METADATA_MISMATCH', 'documentKey');
    if (previous.lines.some(line => line.ordinal === source.lines[0].ordinal)) throw new FinanceEvidenceError('LINE_ORDINAL_DUPLICATE', 'lineOrdinal');
    previous.lines.push(...source.lines);
    previous.rowKeys.push(...source.rowKeys);
  }
  return [...grouped.values()].sort((a, b) => a.externalKey.localeCompare(b.externalKey));
}
function validateExpenseGroup(source: HistoryExpense): void {
  source.lines.sort((a, b) => a.ordinal - b.ordinal);
  source.rowKeys = source.lines.map(line => line.rowKey);
  if (source.lines.length > 50) throw new FinanceEvidenceError('EXPENSE_LINE_LIMIT', 'lineOrdinal');
  if (sumMoney(source.lines.map(line => line.amountMinor)) !== source.amountMinor) throw new FinanceEvidenceError('EXPENSE_SUM_MISMATCH', 'documentAmountMinor');
}
function validateGroups(sources: HistorySource[]): void {
  if (sources.length > 200) throw new FinanceEvidenceError('IMPORT_SOURCE_LIMIT');
  const openings = new Set<string>();
  for (const source of sources) {
    if (source.kind === 'EXPENSE') validateExpenseGroup(source);
    if (source.kind === 'OPENING') {
      if (openings.has(source.accountId)) throw new FinanceEvidenceError('OPENING_ACCOUNT_DUPLICATE', 'accountId');
      openings.add(source.accountId);
    }
    if (source.kind === 'SETTLEMENT' && source.expenseDocumentKey && !sources.some(item => item.kind === 'EXPENSE' && item.externalKey === source.expenseDocumentKey)) throw new FinanceEvidenceError('EXPENSE_DOCUMENT_NOT_FOUND', 'expenseDocumentKey');
  }
}
export function parseHistoryImportCsv(csv: string): HistoryParseResult {
  const errors: HistoryParseResult['errors'] = [];
  const rows: HistoryParsedRow[] = [];
  const keys = new Set<string>();
  let sources: HistorySource[] = [];
  try {
    parseBoundedCsv(csv, HISTORY_CSV_HEADER).forEach((values, index) => {
      try {
        const source = parseRow(values);
        const rowKey = source.rowKeys[0];
        if (keys.has(rowKey)) throw new FinanceEvidenceError('ROW_KEY_DUPLICATE', 'rowKey');
        keys.add(rowKey);
        rows.push({ ordinal: index + 2, rowKey, source });
      } catch (error) { errors.push(issue(error, index + 2)); }
    });
    sources = collectSources(rows);
    validateGroups(sources);
  } catch (error) { errors.push(issue(error)); }
  return { rows, sources, errors, canonicalDigest: errors.length ? null : evidenceDigest(sources) };
}
