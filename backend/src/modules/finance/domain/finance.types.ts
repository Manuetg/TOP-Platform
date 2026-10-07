export type CatalogKind = 'CATEGORY' | 'COUNTERPARTY';
export type AccountKind = 'CASH' | 'BANK';
export type CashMovementKind = 'CONTRIBUTION' | 'WITHDRAWAL' | 'FINANCING' | 'ADJUSTMENT';
export type MovementSource = 'OPENING' | 'SETTLEMENT' | 'PAYMENT' | 'VOID' | 'REFUND' | 'TRANSFER' | 'MOVEMENT';

export interface ExpenseLineInput {
  label: string;
  categoryId: string;
  resourceId: string | null;
  amountMinor: number;
  operational: boolean;
}
export interface SettlementInput { accountId: string; amountMinor: number; occurredAt: string; reference: string | null }
export interface OpeningInput { amountMinor: number; occurredAt: string; reason: string }

export type FinanceCommand =
  | { type: 'CREATE_CATALOG'; kind: CatalogKind; name: string }
  | { type: 'ARCHIVE_CATALOG'; id: string; expectedVersion: number; reason: string }
  | { type: 'CREATE_ACCOUNT'; kind: AccountKind; name: string; opening: OpeningInput | null }
  | { type: 'ARCHIVE_ACCOUNT'; id: string; expectedVersion: number; reason: string }
  | { type: 'OPEN_ACCOUNT'; id: string; expectedVersion: number; opening: OpeningInput }
  | { type: 'CREATE_EXPENSE'; description: string; consumedOn: string; dueOn: string | null; counterpartyId: string | null; reference: string | null; amountMinor: number; lines: ExpenseLineInput[]; settlement: SettlementInput | null }
  | { type: 'SETTLE_EXPENSE'; id: string; expectedVersion: number; settlement: SettlementInput }
  | { type: 'SET_EVIDENCE'; id: string; expectedVersion: number; reference: string | null; reason: string }
  | { type: 'LINK_PAYMENT'; paymentId: string; accountId: string; expectedVersion: number; reason: string }
  | { type: 'TRANSFER'; fromAccountId: string; toAccountId: string; amountMinor: number; occurredAt: string; reason: string }
  | { type: 'CASH_MOVEMENT'; accountId: string; kind: CashMovementKind; amountMinor: number; occurredAt: string; reason: string; openingId: string | null }
  | { type: 'REVIEW_MOVEMENT'; sourceType: MovementSource; sourceId: string; sourceVersion: number; expectedVersion: number; reviewed: boolean; reason: string }
  | { type: 'COUNT_CASH'; accountId: string; occurredAt: string; countedAmountMinor: number; reason: string }
  | { type: 'ADJUST_COUNT'; id: string; expectedVersion: number; reason: string };

export interface FinanceActor { businessId: string; actorUserId: string }
export interface FinanceMutation extends FinanceActor { command: FinanceCommand; idempotencyKey: string; fingerprint: string }
export interface FinanceResult { id: string; version: number; type: FinanceCommand['type'] }
export interface FinanceCatalog { id: string; kind: CatalogKind; name: string; archived: boolean; version: number }
export interface FinanceOpening extends OpeningInput { id: string }
export interface FinanceAccount { id: string; name: string; kind: AccountKind; archived: boolean; version: number; opening: FinanceOpening | null; balanceMinor: number | null; negative: boolean }
export interface ExpenseLine extends ExpenseLineInput { id: string; categoryName: string; resourceName: string | null }
export interface FinanceSettlement extends SettlementInput { id: string; recordedByUserId: string }
export interface FinanceExpense {
  id: string; description: string; consumedOn: string; dueOn: string | null;
  counterpartyId: string | null; counterpartyName: string | null; reference: string | null;
  evidenceMissing: boolean; amountMinor: number; paidAmountMinor: number; outstandingMinor: number;
  overdue: boolean; version: number; lines: ExpenseLine[]; settlements: FinanceSettlement[];
  recordedByUserId: string; createdAt: string;
}
export interface FinancePayment {
  id: string; bookingId: string; amountMinor: number; currency: string; paidAt: string; reference: string | null;
  accountId: string | null; version: number; paymentVersion: number; includedInBalance: boolean;
  effectiveStatus: 'RETAINED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED';
  grossRecordedAmountMinor: number; voidedAmountMinor: number; refundedAmountMinor: number; netRetainedAmountMinor: number;
}
export interface FinanceMovement {
  bookingId?: string;
  paymentId?: string;
  id: string; sourceType: MovementSource; sourceId: string; sourceVersion: number;
  accountId: string; amountMinor: number; occurredAt: string; description: string;
  includedInBalance: boolean; reviewed: boolean; reviewVersion: number; reviewStale: boolean;
  reviewDetails?: { actorUserId: string; occurredAt: string; reason: string } | null;
}
export interface FinanceCashCount {
  id: string; accountId: string; occurredAt: string; expectedAmountMinor: number;
  countedAmountMinor: number; differenceMinor: number; reason: string;
  version: number; adjustmentId: string | null; recordedByUserId: string;
}
export interface FinanceAuditItem { id: string; action: string; sourceId: string; actorUserId: string; occurredAt: string; details: unknown }
export interface FinanceQuery { from: string; to: string }
export interface FinanceReport {
  businessId: string; currency: 'PYG'; timeZone: string; basis: 'REGISTERED_OPERATIONS';
  from: string; to: string; asOf: string; token: string; sourceLimit: number;
  catalogs: FinanceCatalog[]; resources: { id: string; name: string; active: boolean }[];
  accounts: FinanceAccount[]; expenses: FinanceExpense[]; movements: FinanceMovement[];
  balanceSources: FinanceMovement[];
  payments: FinancePayment[]; cashCounts: FinanceCashCount[];
  totals: {
    expenseMinor: number; operatingCostMinor: number; paymentsMinor: number; settlementsMinor: number; outstandingMinor: number; overdueMinor: number; unassignedPaymentsMinor: number; registeredBalanceMinor: number | null;
    grossRecordedAmountMinor: number; voidedAmountMinor: number; refundedAmountMinor: number;
    netRecordedReceiptFlowMinor: number; paymentNetRetainedAmountMinor: number;
  };
  coverage: { unconfiguredAccountIds: string[]; missingEvidenceExpenseIds: string[]; unknownHistoricalDebt: true; serviceRevenueAvailable: false };
}

export const FINANCE_REPOSITORY = Symbol('FINANCE_REPOSITORY');
export interface FinanceRepository {
  execute(input: FinanceMutation): Promise<FinanceResult>;
  report(actor: FinanceActor, query: FinanceQuery): Promise<FinanceReport>;
  expense(actor: FinanceActor, expenseId: string): Promise<{ expense: FinanceExpense; audit: FinanceAuditItem[] }>;
  audit(actor: FinanceActor, sourceType: MovementSource, sourceId: string): Promise<FinanceAuditItem[]>;
}
