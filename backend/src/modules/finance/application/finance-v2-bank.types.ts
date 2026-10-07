import type { EvidenceIssue } from './finance-v2-evidence.validation';
import type { ImportAccount } from './finance-v2-import.types';

export interface BankCsvRow { externalKey: string; bookedOn: string; amountMinor: number; reference: string | null }
export interface BankParsedStatement { rows: BankCsvRow[]; errors: EvidenceIssue[]; canonicalDigest: string | null; totalMinor: number | null }
export interface BankStatementInput { businessId: string; accountId: string; expectedAccountVersion: number; sourceNamespace: string; csv: string }
export interface BankStatementSnapshot {
  businessId: string; timeZone: string; account: ImportAccount;
  existingRows: readonly { id: string; businessId: string; accountId: string; sourceNamespace: string; externalKey: string; payloadDigest: string }[];
}
export interface BankStatementPreview extends BankParsedStatement {
  valid: boolean; previewToken: string | null;
  items: { row: BankCsvRow; payloadDigest: string; status: 'NEW' | 'ALREADY_IMPORTED'; rowId: string | null }[];
  basis: 'EXTERNAL_EVIDENCE_ONLY'; registeredCashDeltaMinor: 0;
}
export type BankSourceType = 'PAYMENT' | 'REFUND' | 'SETTLEMENT' | 'TRANSFER' | 'MOVEMENT';
export type BankSourceLeg = 'FROM' | 'TO' | null;
export interface BankMatchComponentInput { sourceType: BankSourceType; sourceId: string; sourceLeg: BankSourceLeg; sourceVersion: number; sourceHash: string; amountMinor: number }
export interface BankRowSnapshot { id: string; businessId: string; accountId: string; version: number; amountMinor: number; bookedOn: string; reference: string | null; reservedMinor: number }
export interface BankSourceSnapshot extends BankMatchComponentInput {
  businessId: string; accountId: string | null; currency: 'PYG'; occurredAt: string; bookedOn: string; reference: string | null;
  reservedMinor: number; eligible: boolean; linkVersion: number | null;
}
export interface BankPaymentLinkInput { paymentId: string; expectedLinkVersion: number; accountId: string; reason: string }
export interface BankFeeExpenseDefinition {
  description: string; amountMinor: number; counterpartyId: string | null; reference: string | null;
  lines: readonly { label: string; categoryId: string; resourceId: string | null; bookingId: string | null; amountMinor: number; operational: boolean }[];
}
export type BankFeeInput = { bankRowId: string } & (
  | { existingExpenseId: string; existingSettlementId: string }
  | { expenseDefinition: BankFeeExpenseDefinition; consumedOn: string; occurredAt: string; reference: string | null }
);
export interface BankFeeOriginSnapshot { bankRowId: string; businessId: string; expenseId: string; settlementId: string; amountMinor: number }
export interface BankFeeExistingSnapshot { businessId: string; expenseId: string; settlementId: string; accountId: string; expenseAmountMinor: number; settlementAmountMinor: number; eligible: boolean }
export interface BankMatchSnapshot {
  businessId: string; timeZone: string; now: string; account: ImportAccount; policy: { enabled: boolean; version: number };
  rows: readonly BankRowSnapshot[]; sources: readonly BankSourceSnapshot[]; feeOrigins: readonly BankFeeOriginSnapshot[];
  existingFees: readonly BankFeeExistingSnapshot[];
  feeReferences: readonly { id: string; businessId: string; kind: 'CATEGORY' | 'COUNTERPARTY' | 'RESOURCE' | 'BOOKING'; archived: boolean; resourceId?: string | null; version: number }[];
}
export interface BankMatchInput {
  businessId: string; accountId: string; rows: readonly { id: string; version: number; amountMinor: number }[];
  components: readonly BankMatchComponentInput[]; paymentLinks: readonly BankPaymentLinkInput[]; fees: readonly BankFeeInput[];
}
export interface BankSourceForeignKeys { paymentId: string | null; paymentAdjustmentId: string | null; settlementId: string | null; transferId: string | null; cashMovementId: string | null }
export interface BankValidatedComponent extends BankMatchComponentInput, BankSourceForeignKeys { sourceKey: string; accountId: string }
export interface BankFeePlan { bankRowId: string; mode: 'EXISTING' | 'CREATE'; amountMinor: number; expenseId: string | null; settlementId: string | null; input: BankFeeInput }
export interface BankResidual { key: string; amountMinor: number; reservedMinor: number; consumedMinor: number; residualMinor: number; status: 'PARTIAL' | 'MATCHED' }
export interface BankMatchPreview {
  valid: boolean; errors: EvidenceIssue[]; staleReasons: string[]; previewToken: string | null;
  rowTotalMinor: number | null; componentTotalMinor: number | null; plannedFeeTotalMinor: number;
  rows: BankResidual[]; sources: BankResidual[]; components: BankValidatedComponent[]; fees: BankFeePlan[];
  suggestions: BankSuggestion[]; registeredCashDeltaMinor: 0;
}
export interface BankSuggestion { bankRowId: string; sourceKey: string; amountMinor: number; reasons: readonly ('EXACT_AMOUNT' | 'EXACT_DATE' | 'EXACT_REFERENCE')[]; confirmation: 'REQUIRES_EXPLICIT_COMMAND' }
