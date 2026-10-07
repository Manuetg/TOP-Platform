import type { EvidenceIssue } from './finance-v2-evidence.validation';

export interface HistoryOpening { kind: 'OPENING'; externalKey: string; rowKeys: string[]; accountId: string; amountMinor: number; occurredAt: string; reason: string }
export interface HistoryExpenseLine { rowKey: string; ordinal: number; label: string; categoryId: string; resourceId: string | null; bookingId: string | null; amountMinor: number; operational: boolean }
export interface HistoryExpense {
  kind: 'EXPENSE'; externalKey: string; rowKeys: string[]; description: string; consumedOn: string; dueOn: string | null;
  counterpartyId: string | null; reference: string | null; amountMinor: number; lines: HistoryExpenseLine[];
}
export interface HistorySettlement {
  kind: 'SETTLEMENT'; externalKey: string; rowKeys: string[]; accountId: string; expenseId: string | null;
  expenseDocumentKey: string | null; amountMinor: number; occurredAt: string; reference: string | null; includedInOpening: boolean;
}
export type HistorySource = HistoryOpening | HistoryExpense | HistorySettlement;
export interface HistoryParsedRow { ordinal: number; rowKey: string; source: HistorySource }
export interface HistoryParseResult { rows: HistoryParsedRow[]; sources: HistorySource[]; errors: EvidenceIssue[]; canonicalDigest: string | null }
export interface ScopedEvidenceRef { id: string; businessId: string; version: number; archived: boolean }
export interface ImportAccount extends ScopedEvidenceRef { kind: 'CASH' | 'BANK'; currency: 'PYG'; opening: { id: string; occurredAt: string; amountMinor: number } | null }
export interface ImportExistingItem { businessId: string; sourceNamespace: string; externalKey: string; payloadDigest: string; kind: HistorySource['kind']; sourceId: string }
export interface ImportSnapshot {
  businessId: string; timeZone: string; now: string; policy: { enabled: boolean; version: number };
  accounts: readonly ImportAccount[]; catalogs: readonly (ScopedEvidenceRef & { kind: 'CATEGORY' | 'COUNTERPARTY' })[];
  resources: readonly ScopedEvidenceRef[]; bookings: readonly (ScopedEvidenceRef & { resourceId: string | null })[];
  expenses: readonly { id: string; businessId: string; version: number; outstandingMinor: number }[];
  importedItems: readonly ImportExistingItem[];
}
export interface HistoryImportInput { businessId: string; sourceNamespace: string; csv: string }
export interface HistoryPreviewItem { source: HistorySource; payloadDigest: string; status: 'NEW' | 'ALREADY_IMPORTED'; sourceId: string | null }
export interface HistoryImportPreview extends HistoryParseResult {
  items: HistoryPreviewItem[]; valid: boolean; previewToken: string | null;
  cash: { includedDeltaMinor: number; excludedSettlementMinor: number; openingDeclaredMinor: number };
}
