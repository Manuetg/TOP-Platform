import { sumMoney } from '../domain/finance-money';
import { evidenceDigest, evidenceInstant, evidenceText, FinanceEvidenceError, issue } from './finance-v2-evidence.validation';
import { parseHistoryImportCsv } from './finance-v2-import.parser';
import type { HistoryExpense, HistoryImportInput, HistoryImportPreview, HistoryPreviewItem, HistorySettlement, HistorySource, ImportSnapshot, ScopedEvidenceRef } from './finance-v2-import.types';
export { HISTORY_CSV_HEADER, parseHistoryImportCsv } from './finance-v2-import.parser';
export type * from './finance-v2-import.types';

function scoped<T extends { id: string; businessId: string }>(refs: readonly T[], id: string, businessId: string, column: string): T {
  const ref = refs.find(item => item.id === id && item.businessId === businessId);
  if (!ref) throw new FinanceEvidenceError('REFERENCE_NOT_FOUND', column);
  return ref;
}
function available<T extends ScopedEvidenceRef>(refs: readonly T[], id: string, businessId: string, column: string): T {
  const ref = scoped(refs, id, businessId, column);
  if (ref.archived) throw new FinanceEvidenceError('REFERENCE_UNAVAILABLE', column);
  return ref;
}
function expenseRefs(source: HistoryExpense, snapshot: ImportSnapshot): void {
  if (source.counterpartyId) {
    const ref = available(snapshot.catalogs, source.counterpartyId, snapshot.businessId, 'counterpartyId');
    if (ref.kind !== 'COUNTERPARTY') throw new FinanceEvidenceError('CATALOG_KIND_INVALID', 'counterpartyId');
  }
  for (const line of source.lines) {
    const category = available(snapshot.catalogs, line.categoryId, snapshot.businessId, 'categoryId');
    if (category.kind !== 'CATEGORY') throw new FinanceEvidenceError('CATALOG_KIND_INVALID', 'categoryId');
    if (line.resourceId) scoped(snapshot.resources, line.resourceId, snapshot.businessId, 'resourceId');
    if (line.bookingId) {
      const booking = scoped(snapshot.bookings, line.bookingId, snapshot.businessId, 'bookingId');
      if (booking.resourceId !== line.resourceId) throw new FinanceEvidenceError('BOOKING_RESOURCE_MISMATCH', 'bookingId');
    }
  }
  if (snapshot.policy.enabled) throw new FinanceEvidenceError('EXPENSE_APPROVAL_REQUIRED', 'documentKey');
}
function importItem(source: HistorySource, namespace: string, snapshot: ImportSnapshot): HistoryPreviewItem {
  const payloadDigest = evidenceDigest(source);
  const existing = snapshot.importedItems.find(item => item.businessId === snapshot.businessId && item.sourceNamespace === namespace && item.externalKey === source.externalKey);
  if (existing && (existing.payloadDigest !== payloadDigest || existing.kind !== source.kind)) throw new FinanceEvidenceError('IMPORT_KEY_CONFLICT', 'rowKey');
  return { source, payloadDigest, status: existing ? 'ALREADY_IMPORTED' : 'NEW', sourceId: existing?.sourceId ?? null };
}
function account(source: HistorySource, items: HistoryPreviewItem[], snapshot: ImportSnapshot): void {
  if (source.kind === 'EXPENSE') { expenseRefs(source, snapshot); return; }
  const ref = available(snapshot.accounts, source.accountId, snapshot.businessId, 'accountId');
  if (ref.currency !== 'PYG') throw new FinanceEvidenceError('CURRENCY_INVALID', 'accountId');
  if (Date.parse(source.occurredAt) > Date.parse(snapshot.now)) throw new FinanceEvidenceError('FUTURE_OCCURRED_AT', 'occurredAt');
  if (source.kind === 'OPENING') {
    if (ref.opening) throw new FinanceEvidenceError('OPENING_ALREADY_EXISTS', 'accountId');
    return;
  }
  const importedOpening = items.find(item => item.source.kind === 'OPENING' && item.source.accountId === source.accountId);
  const opening = importedOpening?.source.kind === 'OPENING' ? importedOpening.source : ref.opening;
  if (!opening) throw new FinanceEvidenceError('OPENING_REQUIRED', 'accountId');
  const before = Date.parse(source.occurredAt) < Date.parse(opening.occurredAt);
  if (before !== source.includedInOpening) throw new FinanceEvidenceError('OPENING_INCLUSION_MISMATCH', 'includedInOpening');
}
function settlementTarget(source: HistorySettlement, items: HistoryPreviewItem[], snapshot: ImportSnapshot): { key: string; outstandingMinor: number } {
  if (source.expenseId) {
    const existing = scoped(snapshot.expenses, source.expenseId, snapshot.businessId, 'expenseId');
    return { key: existing.id, outstandingMinor: existing.outstandingMinor };
  }
  const item = items.find(candidate => candidate.source.kind === 'EXPENSE' && candidate.source.externalKey === source.expenseDocumentKey);
  if (!item || item.source.kind !== 'EXPENSE') throw new FinanceEvidenceError('EXPENSE_DOCUMENT_NOT_FOUND', 'expenseDocumentKey');
  if (item.status === 'NEW') return { key: item.source.externalKey, outstandingMinor: item.source.amountMinor };
  const existing = scoped(snapshot.expenses, item.sourceId ?? '', snapshot.businessId, 'expenseDocumentKey');
  return { key: existing.id, outstandingMinor: existing.outstandingMinor };
}
function settlementCapacity(items: HistoryPreviewItem[], snapshot: ImportSnapshot): void {
  const used = new Map<string, number>();
  for (const item of items) {
    if (item.source.kind !== 'SETTLEMENT' || item.status === 'ALREADY_IMPORTED') continue;
    const target = settlementTarget(item.source, items, snapshot);
    const total = sumMoney([used.get(target.key) ?? 0, item.source.amountMinor]);
    if (total > target.outstandingMinor) throw new FinanceEvidenceError('EXPENSE_CAPACITY_EXCEEDED', 'amountMinor');
    used.set(target.key, total);
  }
}
function sortRefs<T extends { id: string }>(refs: readonly T[]): T[] { return [...refs].sort((a, b) => a.id.localeCompare(b.id)); }
function token(input: HistoryImportInput, namespace: string, preview: HistoryImportPreview, snapshot: ImportSnapshot): string {
  return evidenceDigest({ businessId: input.businessId, namespace, digest: preview.canonicalDigest, timeZone: snapshot.timeZone, policy: snapshot.policy, accounts: sortRefs(snapshot.accounts), catalogs: sortRefs(snapshot.catalogs), resources: sortRefs(snapshot.resources), bookings: sortRefs(snapshot.bookings), expenses: sortRefs(snapshot.expenses), imported: preview.items.map(item => ({ key: item.source.externalKey, status: item.status, id: item.sourceId })) });
}
function cash(items: HistoryPreviewItem[]): HistoryImportPreview['cash'] {
  const sources = items.filter(item => item.status === 'NEW').map(item => item.source);
  return {
    includedDeltaMinor: sumMoney(sources.filter((source): source is HistorySettlement => source.kind === 'SETTLEMENT' && !source.includedInOpening).map(source => -source.amountMinor)),
    excludedSettlementMinor: sumMoney(sources.filter((source): source is HistorySettlement => source.kind === 'SETTLEMENT' && source.includedInOpening).map(source => source.amountMinor)),
    openingDeclaredMinor: sumMoney(sources.filter(source => source.kind === 'OPENING').map(source => source.amountMinor)),
  };
}
export function previewHistoryImport(input: HistoryImportInput, snapshot: ImportSnapshot): HistoryImportPreview {
  const parsed = parseHistoryImportCsv(input.csv);
  const result: HistoryImportPreview = { ...parsed, items: [], valid: false, previewToken: null, cash: { includedDeltaMinor: 0, excludedSettlementMinor: 0, openingDeclaredMinor: 0 } };
  try {
    if (input.businessId !== snapshot.businessId) throw new FinanceEvidenceError('BUSINESS_MISMATCH');
    const namespace = evidenceText(input.sourceNamespace, 'sourceNamespace', 64);
    evidenceInstant(snapshot.now, 'now');
    if (parsed.errors.length) return result;
    result.items = parsed.sources.map(source => importItem(source, namespace, snapshot));
    for (const item of result.items) {
      if (item.status !== 'NEW') continue;
      try { account(item.source, result.items, snapshot); } catch (error) {
        result.errors.push(issue(error, parsed.rows.find(row => row.rowKey === item.source.rowKeys[0])?.ordinal));
      }
    }
    settlementCapacity(result.items, snapshot);
    result.cash = cash(result.items);
    result.valid = result.errors.length === 0;
    if (result.valid) result.previewToken = token(input, namespace, result, snapshot);
  } catch (error) { result.errors.push(issue(error)); }
  return result;
}
export function requireHistoryImportConfirmation(input: HistoryImportInput, snapshot: ImportSnapshot, expectedToken: string): HistoryImportPreview {
  const preview = previewHistoryImport(input, snapshot);
  if (!preview.valid || preview.previewToken !== expectedToken) throw new FinanceEvidenceError('IMPORT_PREVIEW_STALE');
  return preview;
}
