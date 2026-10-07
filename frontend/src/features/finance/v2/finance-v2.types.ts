// Contrato externo V2 para revisión del único escritor de contratos; no habilita endpoints.
// PYG 1:1: cada number monetario debe validarse como entero seguro, incluidas acumulaciones.
export type FinanceV2Currency = 'PYG';
export type FinanceDraftState = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONFIRMED';
export type FinanceLaborKind = 'PRECOMPUTED_LABOR' | 'OWNER_IMPUTED';
export type FinanceV2Capability = 'finance.read' | 'finance.write' | 'finance.export' | 'finance.import' | 'finance.planning' | 'finance.approve' | 'finance.labor';
export interface FinanceV2Actor { businessId: string; actorUserId: string }
export interface ExpenseDefinitionLine {
  label: string; categoryId: string; resourceId: string | null; bookingId: string | null;
  amountMinor: number; operational: boolean;
}
export interface ExpenseDefinition {
  description: string; counterpartyId: string | null; reference: string | null;
  amountMinor: number; lines: ExpenseDefinitionLine[];
}
export interface SettlementInputV2 { accountId: string; amountMinor: number; occurredAt: string; reference: string | null }
export interface AllocationRulePartInput { resourceId: string; basisPoints: number }
export type AllocationSource = { kind: 'EXPENSE_LINE'; id: string } | { kind: 'LABOR_ESTIMATE' | 'OWNER_IMPUTED'; id: string };
export type BankComponentRef =
  | { sourceType: 'PAYMENT' | 'REFUND' | 'SETTLEMENT' | 'MOVEMENT'; sourceId: string; sourceLeg: null }
  | { sourceType: 'TRANSFER'; sourceId: string; sourceLeg: 'FROM' | 'TO' };
export type BankMatchComponentInput = BankComponentRef & { sourceVersion: number; sourceHash: string; amountMinor: number };
export interface FinanceBankMatchSourceDto {
  ref: BankComponentRef; sourceVersion: number; sourceHash: string; amountMinor: number;
  residualMinor: number; description: string; occurredAt: string;
  accountId: string | null; needsAccountLink: boolean;
}
export type BankFeeInput = { bankRowId: string } & (
  | { existingExpenseId: string; existingSettlementId: string; expenseDefinition?: never; consumedOn?: never; occurredAt?: never; reference?: never }
  | { expenseDefinition: ExpenseDefinition; consumedOn: string; occurredAt: string; reference: string | null; existingExpenseId?: never; existingSettlementId?: never }
);
export interface BudgetLineInput { categoryId: string | null; resourceId: string | null; approvedMinor: number }
export interface CommitmentExpenseInput extends ExpenseDefinition { consumedOn: string; dueOn: string | null; settlement: SettlementInputV2 | null }

export interface ConfirmHistoryImportCommand { type: 'CONFIRM_HISTORY_IMPORT'; sourceNamespace: string; csv: string; previewToken: string; reason: string }
export interface ConfirmBankStatementCommand { type: 'CONFIRM_BANK_STATEMENT'; accountId: string; expectedAccountVersion: number; sourceNamespace: string; csv: string; previewToken: string; reason: string }
export interface CreateExpenseTemplateCommand { type: 'CREATE_EXPENSE_TEMPLATE'; name: string; expenseDefinition: ExpenseDefinition }
export interface ReviseExpenseTemplateCommand { type: 'REVISE_EXPENSE_TEMPLATE'; id: string; expectedVersion: number; expenseDefinition: ExpenseDefinition; reason: string }
export interface GenerateRecurringDraftCommand { type: 'GENERATE_RECURRING_DRAFT'; templateId: string; expectedTemplateVersion: number; periodMonth: string; consumedOn: string; dueOn: string | null }
export interface CreateExpenseDraftCommand { type: 'CREATE_EXPENSE_DRAFT'; expenseDefinition: ExpenseDefinition; consumedOn: string; dueOn: string | null }
export interface EditExpenseDraftCommand { type: 'EDIT_EXPENSE_DRAFT'; id: string; expectedVersion: number; expenseDefinition: ExpenseDefinition; consumedOn: string; dueOn: string | null; reason: string }
export interface SubmitExpenseDraftCommand { type: 'SUBMIT_EXPENSE_DRAFT'; id: string; expectedVersion: number; expectedPolicyVersion: number; reason: string }
export interface WithdrawExpenseDraftCommand { type: 'WITHDRAW_EXPENSE_DRAFT'; id: string; expectedVersion: number; reason: string }
export interface DecideExpenseDraftCommand { type: 'DECIDE_EXPENSE_DRAFT'; id: string; expectedVersion: number; policyRevisionId: string; decision: 'APPROVE' | 'REJECT'; reason: string }
export interface ConfirmExpenseDraftCommand { type: 'CONFIRM_EXPENSE_DRAFT'; id: string; expectedVersion: number; settlement: SettlementInputV2 | null; reason: string }
export interface SetExpenseApprovalPolicyCommand { type: 'SET_EXPENSE_APPROVAL_POLICY'; expectedPolicyVersion: number; enabled: boolean; scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS'; requireDifferentActor: true; reason: string }
export interface CreateReimbursementDraftCommand {
  type: 'CREATE_REIMBURSEMENT_DRAFT'; expenseDefinition: ExpenseDefinition; consumedOn: string; dueOn: string | null;
  creditorCounterpartyId: string; supplierCounterpartyId: string | null; externallyPaidOn: string; privateReference: string | null;
}
export interface ReimburseExpenseCommand { type: 'REIMBURSE_EXPENSE'; expenseId: string; expectedVersion: number; settlement: SettlementInputV2; reason: string }
export interface ConfirmBankMatchCommand {
  type: 'CONFIRM_BANK_MATCH'; accountId: string; rows: { id: string; version: number; amountMinor: number }[];
  components: BankMatchComponentInput[]; paymentLinks: { paymentId: string; expectedLinkVersion: number; accountId: string; reason: string }[];
  fees: BankFeeInput[]; previewToken: string; reason: string;
}
export interface CancelBankMatchCommand { type: 'CANCEL_BANK_MATCH'; id: string; expectedVersion: number; reason: string }
export interface CreateAllocationRuleCommand { type: 'CREATE_ALLOCATION_RULE'; name: string; validFrom: string; validTo: string | null; parts: AllocationRulePartInput[] }
export interface ReviseAllocationRuleCommand { type: 'REVISE_ALLOCATION_RULE'; id: string; expectedVersion: number; validFrom: string; validTo: string | null; parts: AllocationRulePartInput[]; reason: string }
export interface ApplyCostAllocationCommand { type: 'APPLY_COST_ALLOCATION'; source: AllocationSource; expectedSourceVersion: number; ruleId: string; ruleVersion: number; expectedAllocationVersion: number; reason: string }
export interface CreateLaborCostCommand { type: 'CREATE_LABOR_COST'; label: string; personLabel: string | null; periodMonth: string; consumedOn: string; kind: FinanceLaborKind; actualExpenseLineId: string | null; estimatedMinor: number | null; reason: string }
export interface ReviseLaborCostCommand { type: 'REVISE_LABOR_COST'; id: string; expectedVersion: number; actualExpenseLineId: string | null; estimatedMinor: number | null; reason: string }
export interface CreateBudgetRevisionCommand { type: 'CREATE_BUDGET_REVISION'; periodMonth: string; expectedBudgetVersion: number; lines: BudgetLineInput[]; reason: string }
export interface ApproveBudgetRevisionCommand { type: 'APPROVE_BUDGET_REVISION'; id: string; expectedBudgetVersion: number; reason: string }
export interface CreateCommitmentCommand { type: 'CREATE_COMMITMENT'; description: string; amountMinor: number; categoryId: string | null; resourceId: string | null; expectedConsumptionOn: string; dueOn: string | null; operational: boolean; reference: string | null; reason: string }
export interface CancelCommitmentCommand { type: 'CANCEL_COMMITMENT'; id: string; expectedVersion: number; reason: string }
export type ConvertCommitmentCommand = { type: 'CONVERT_COMMITMENT'; id: string; expectedVersion: number; reason: string } & (
  | { expenseDraftId: string; expectedDraftVersion: number; expense: null }
  | { expenseDraftId: null; expectedDraftVersion: null; expense: CommitmentExpenseInput }
);
export type FinanceV2Command =
  | ConfirmHistoryImportCommand | ConfirmBankStatementCommand | CreateExpenseTemplateCommand | ReviseExpenseTemplateCommand | GenerateRecurringDraftCommand
  | CreateExpenseDraftCommand | EditExpenseDraftCommand | SubmitExpenseDraftCommand | WithdrawExpenseDraftCommand | DecideExpenseDraftCommand | ConfirmExpenseDraftCommand
  | SetExpenseApprovalPolicyCommand | CreateReimbursementDraftCommand | ReimburseExpenseCommand | ConfirmBankMatchCommand | CancelBankMatchCommand
  | CreateAllocationRuleCommand | ReviseAllocationRuleCommand | ApplyCostAllocationCommand | CreateLaborCostCommand | ReviseLaborCostCommand
  | CreateBudgetRevisionCommand | ApproveBudgetRevisionCommand | CreateCommitmentCommand | CancelCommitmentCommand | ConvertCommitmentCommand;
export type FinanceV2CommandType = FinanceV2Command['type'];
export type FinanceV2Operation = `FINANCE_V2.${FinanceV2CommandType}`;
export interface FinanceV2Mutation extends FinanceV2Actor { command: FinanceV2Command; idempotencyKey: string; fingerprint: string }
export interface FinanceV2Result {
  id: string; version: number; type: FinanceV2CommandType;
  relatedIds?: { expenseId?: string; settlementId?: string; draftId?: string; revisionId?: string; claimId?: string; conversionId?: string; bankStatementId?: string; importBatchId?: string };
  alreadyGenerated?: boolean; alreadyImported?: boolean;
}
export type FinanceV2ErrorCode = 'INVALID_INPUT' | 'NOT_AUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT'
  | 'PREVIEW_STALE' | 'SOURCE_STALE' | 'SOURCE_LIMIT_EXCEEDED' | 'EXPENSE_APPROVAL_REQUIRED' | 'DIFFERENT_APPROVER_REQUIRED'
  | 'INVALID_DRAFT_STATE' | 'IMPORT_KEY_CONFLICT' | 'BANK_MATCH_CAPACITY_EXCEEDED' | 'COMMITMENT_CAPACITY_EXCEEDED' | 'MONEY_OVERFLOW';
export interface FinanceV2ErrorDto { statusCode: 400 | 401 | 403 | 404 | 409; code: FinanceV2ErrorCode; message: string }
export interface FinanceV2AuditItem {
  readonly id: string; readonly action: FinanceV2Operation; readonly sourceId: string; readonly actorUserId: string; readonly occurredAt: string;
  readonly details: { command: FinanceV2AuditCommand; beforeVersion: number | null; afterVersion: number; relatedIds: string[]; reason: string | null; result: FinanceV2Result };
}
export type FinanceV2AuditCommand = Exclude<FinanceV2Command, ConfirmHistoryImportCommand | ConfirmBankStatementCommand>
  | (Omit<ConfirmHistoryImportCommand, 'csv'> & { csvDigest: string })
  | (Omit<ConfirmBankStatementCommand, 'csv'> & { csvDigest: string });
export interface FinanceExpenseDraftLineDto extends ExpenseDefinitionLine { id: string; ordinal: number; categoryName: string; resourceName: string | null }
export interface FinanceDraftDecisionDto { id: string; draftVersionAtSubmission: number; policyRevisionId: string; decision: 'APPROVE' | 'REJECT'; actorUserId: string; reason: string; occurredAt: string }
export interface FinanceReimbursementDto { creditorCounterpartyId: string; supplierCounterpartyId: string | null; externallyPaidOn: string; privateReference: string | null }
export interface FinanceExpenseDraftDto extends Omit<ExpenseDefinition, 'lines'> {
  id: string; businessId: string; version: number; state: FinanceDraftState; consumedOn: string; dueOn: string | null; creatorUserId: string; createdAt: string;
  templateId: string | null; templateRevisionId: string | null; periodMonth: string | null; approvalPolicyRevisionId: string | null;
  submissionVersion: number | null; confirmedExpenseId: string | null; lines: FinanceExpenseDraftLineDto[]; decisions: FinanceDraftDecisionDto[]; reimbursement: FinanceReimbursementDto | null;
}
export interface FinanceExpenseTemplateRevisionDto { id: string; revisionNo: number; expenseDefinition: ExpenseDefinition; recordedByUserId: string; reason: string; createdAt: string }
export interface FinanceExpenseTemplateDto { id: string; businessId: string; name: string; archived: boolean; version: number; recordedByUserId: string; createdAt: string; revisions: FinanceExpenseTemplateRevisionDto[] }
export interface FinanceApprovalPolicyDto { id: string | null; businessId: string; version: number; enabled: boolean; scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS'; requireDifferentActor: true; recordedByUserId: string | null; reason: string | null; createdAt: string | null }
export interface FinanceBudgetLineDto extends BudgetLineInput { id: string; ordinal: number }
export interface FinanceBudgetRevisionDto { id: string; revisionNo: number; lines: FinanceBudgetLineDto[]; recordedByUserId: string; reason: string; createdAt: string; approvedByUserId: string | null; approvedAt: string | null }
export interface FinanceBudgetDto { id: string; businessId: string; periodMonth: string; kind: 'OPERATING_COST'; version: number; approvedRevisionId: string | null; revisions: FinanceBudgetRevisionDto[] }
export interface FinanceCommitmentConversionDto { id: string; expenseId: string; consumedMinor: number; recordedByUserId: string; createdAt: string }
export interface FinanceCommitmentDto extends Omit<CreateCommitmentCommand, 'type'> { id: string; businessId: string; version: number; state: 'ACTIVE' | 'CANCELLED'; consumedMinor: number; pendingMinor: number; recordedByUserId: string; createdAt: string; conversions: FinanceCommitmentConversionDto[] }
export interface FinanceImportItemDto { id: string; externalKey: string; kind: 'OPENING' | 'EXPENSE' | 'SETTLEMENT'; payloadDigest: string; sourceId: string; status: 'IMPORTED' | 'ALREADY_IMPORTED' }
export interface FinanceImportBatchDto { id: string; businessId: string; sourceNamespace: string; digest: string; formatVersion: 'FINANCE_HISTORY_V1'; loadedAt: string; recordedByUserId: string; items: FinanceImportItemDto[] }
export interface FinanceBankRowDto { id: string; statementId: string; accountId: string; externalKey: string; bookedOn: string; amountMinor: number; reference: string | null; version: number; reservedMinor: number; residualMinor: number; status: 'UNMATCHED' | 'PARTIAL' | 'MATCHED' }
export interface FinanceBankStatementDto { id: string; businessId: string; accountId: string; sourceNamespace: string; canonicalDigest: string; formatVersion: 'FINANCE_BANK_V1'; loadedAt: string; recordedByUserId: string; rows: FinanceBankRowDto[] }
export interface FinanceBankMatchDto { id: string; businessId: string; accountId: string; version: number; state: 'ACTIVE' | 'CANCELLED'; reason: string; recordedByUserId: string; createdAt: string; cancelledByUserId: string | null; cancelledAt: string | null; cancelReason: string | null; rows: { bankRowId: string; consumedAmountMinor: number }[]; components: BankMatchComponentInput[]; staleReasons: string[] }
export interface FinanceAllocationRuleDto { id: string; businessId: string; name: string; archived: boolean; version: number; revisions: { id: string; revisionNo: number; validFrom: string; validTo: string | null; parts: AllocationRulePartInput[]; reason: string; recordedByUserId: string; createdAt: string }[] }
export interface FinanceLaborCostDto { id: string; businessId: string; label: string; personLabel: string | null; periodMonth: string; consumedOn: string; kind: FinanceLaborKind; version: number; revisions: { id: string; revisionNo: number; actualExpenseLineId: string | null; estimatedMinor: number | null; reason: string; recordedByUserId: string; createdAt: string }[] }
export interface V2Meta { businessId: string; currency: 'PYG'; timeZone: string; from: string; to: string; asOf: string; token: string; sourceLimit: 5000 }
export interface SourceRef { kind: 'EXPENSE_LINE' | 'LABOR_ESTIMATE' | 'OWNER_IMPUTED'; id: string; version: number; hash: string }
export interface FinanceCostRow {
  source: SourceRef; expenseId: string | null; expenseLineId: string | null; bookingId: string | null; resourceId: string | null; categoryId: string | null;
  consumedOn: string; basis: 'ACTUAL' | 'ESTIMATE'; kind: 'DIRECT' | 'COMMON' | 'LABOR' | 'OWNER_WORK'; amountMinor: number | null;
  ruleId: string | null; ruleVersion: number | null; allocationVersion: number; destinations: { resourceId: string; amountMinor: number }[]; unassignedMinor: number | null;
}
export interface FinanceCostReport extends V2Meta {
  basis: 'SOURCE_COSTS'; rows: FinanceCostRow[]; totals: { actualCostMinor: number; estimatedSelectedMinor: number; ownerImputedMinor: number; unknownSourceCount: number };
  coverage: { missingEvidenceSourceIds: string[]; unknownSourceIds: string[]; unsupportedReasons: string[] };
}
export interface FinanceResourceResult {
  resourceId: string | null; recognizedRevenueMinor: number; directActualCostMinor: number; commonActualCostMinor: number; selectedEstimatedCostMinor: number; ownerImputedMinor: number;
  contributionMinor: number | null; operatingResultBeforeOwnerWorkMinor: number | null; resultAfterOwnerWorkMinor: number | null; marginBasisPoints: number | null;
  status: 'COMPLETE' | 'INCOMPLETE' | 'ESTIMATED'; sourceKeys: string[]; reasons: string[];
}
export interface FinanceResourceReport extends V2Meta {
  basis: 'CERTIFIED_SERVICE_AND_SOURCE_COSTS'; recognitionToken: string; costToken: string; rows: FinanceResourceResult[]; business: FinanceResourceResult;
  coverage: { pendingRecognition: string[]; unknownCosts: string[]; unsupportedUnitIds: string[] };
}
export type FinanceBudgetForecastBasis = 'ACTUAL_PLUS_PENDING_COMMITMENTS';
export interface FinanceBudgetComparison extends V2Meta {
  budgetId: string; budgetVersion: number; approvedRevisionId: string | null;
  lines: { resourceId: string | null; categoryId: string | null; approvedMinor: number | null; actualMinor: number; committedPendingMinor: number; forecastMinor: number | null; actualDeviationMinor: number | null; forecastDeviationMinor: number | null }[];
  forecastBasis: 'SCENARIO' | FinanceBudgetForecastBasis | null; scenarioToken: string | null;
  estimatedSelectedMinor: number; ownerImputedMinor: number;
  coverage: { scope: 'KNOWN_OPERATING_SOURCES_ONLY'; sourceLimit: 5000; costSourceToken: string; costSourceCount: number; pendingCommitmentSourceCount: number; unknownCostSourceIds: string[]; missingEvidenceSourceIds: string[]; unsupportedReasons: string[] };
}
export interface FinanceCashProjectionInput {
  asOf: string; horizonTo: string; baseToken: string; accountIds: string[];
  events: { sourceKey: string | null; direction: 'IN' | 'OUT'; amountMinor: number; expectedOn: string; probabilityBasisPoints: number; accountId: string | null; reason: string }[]; excludedSourceKeys: string[];
}
export interface FinanceCashProjection {
  businessId: string; currency: 'PYG'; timeZone: string; asOf: string; token: string; scenarioToken: string;
  sources: { sourceKey: string; origin: 'RECEIVABLE' | 'PAYABLE' | 'COMMITMENT'; direction: 'IN' | 'OUT'; amountMinor: number; expectedOn: string | null; accountId: string | null; reviewRequired: boolean }[];
  registeredBalanceMinor: number | null; forecastDeltaMinor: number; projectedBalanceMinor: number | null; basis: 'REGISTERED_CASH_PLUS_SCENARIO';
  events: { sourceKey: string; origin: 'RECEIVABLE' | 'PAYABLE' | 'COMMITMENT' | 'MANUAL'; amountMinor: number; expectedOn: string; probabilityBasisPoints: number; weightedAmountMinor: number; accountId: string | null; reason: string }[];
  coverage: { unknownAccountIds: string[]; unassignedSourceKeys: string[]; undatedSourceKeys: string[]; reviewBookingIds: string[]; excludedSourceKeys: string[] };
}
export type FinanceAgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'OVER_90' | 'UNDATED' | 'REVIEW';
export interface FinanceAging {
  businessId: string; currency: 'PYG'; timeZone: string; asOf: string; today: string; token: string; basis: 'CURRENT_OBLIGATIONS'; unknownHistoricalDebt: true;
  rows: { direction: 'PAYABLE' | 'RECEIVABLE'; sourceKey: string; bookingId: string | null; expenseId: string | null; amountMinor: number; dueOn: string | null; bucket: FinanceAgingBucket; sourceVersion: number }[];
  credits: { bookingId: string; amountMinor: number }[]; reviewBookingIds: string[];
}
export interface FinanceHistoryPreviewInput { sourceNamespace: string; csv: string }
export interface FinanceBankStatementPreviewInput { accountId: string; expectedAccountVersion: number; sourceNamespace: string; csv: string }
export interface FinancePreviewIssue { ordinal: number; column: string; code: FinanceV2ErrorCode; message: string }
export interface FinanceHistoryPreview {
  businessId: string; sourceNamespace: string; digest: string; previewToken: string | null; issues: FinancePreviewIssue[];
  sources: { rowOrdinals: number[]; externalKey: string; kind: 'OPENING' | 'EXPENSE' | 'SETTLEMENT'; amountMinor: number; existingSourceId: string | null; status: 'NEW' | 'ALREADY_IMPORTED' }[];
  totals: { expenseMinor: number; settlementMinor: number; includedCashMinor: number; excludedCashMinor: number };
}
export interface FinanceBankStatementPreview { businessId: string; accountId: string; canonicalDigest: string; previewToken: string | null; issues: FinancePreviewIssue[]; rows: { ordinal: number; externalKey: string; bookedOn: string; amountMinor: number; reference: string | null; existingRowId: string | null }[] }
export type FinanceBankMatchPreviewInput = Omit<ConfirmBankMatchCommand, 'type' | 'previewToken'>;
export interface FinanceBankMatchPreview { businessId: string; accountId: string; previewToken: string | null; rowTotalMinor: number; componentTotalMinor: number; rows: { id: string; residualMinor: number }[]; sources: { source: BankComponentRef; residualMinor: number }[]; staleReasons: string[] }
export interface FinanceV2PageQuery { cursor: string | null; limit: number }
export interface FinanceV2ReportQuery { from: string; to: string; asOf: string; sourceToken?: string }
export interface FinanceV2Page<T> { items: T[]; nextCursor: string | null }
export const FINANCE_V2_REPOSITORY = Symbol('FINANCE_V2_REPOSITORY');
export interface FinanceV2Repository { execute(input: FinanceV2Mutation): Promise<FinanceV2Result> }
// Los readers comparten el contexto/snapshot en infrastructure; domain no importa Prisma.
export interface FinanceV2ReadRepository {
  bankMatchSources(actor: FinanceV2Actor, accountId: string): Promise<FinanceBankMatchSourceDto[]>;
  bankStatements(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceBankStatementDto>>;
  bankMatches(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceBankMatchDto>>;
  allocationRules(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceAllocationRuleDto>>;
  laborCosts(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceLaborCostDto>>;
  drafts(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceExpenseDraftDto>>;
  draft(actor: FinanceV2Actor, id: string): Promise<{ draft: FinanceExpenseDraftDto; audit: readonly FinanceV2AuditItem[] }>;
  approvalPolicy(actor: FinanceV2Actor): Promise<FinanceApprovalPolicyDto>;
  templates(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceExpenseTemplateDto>>;
  budget(actor: FinanceV2Actor, periodMonth: string): Promise<FinanceBudgetDto | null>;
  budgetComparison(actor: FinanceV2Actor, periodMonth: string, forecastBasis?: FinanceBudgetForecastBasis | null): Promise<FinanceBudgetComparison>;
  commitments(actor: FinanceV2Actor, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceCommitmentDto>>;
  costs(actor: FinanceV2Actor, query: FinanceV2ReportQuery): Promise<FinanceCostReport>;
  resourceResults(actor: FinanceV2Actor, query: FinanceV2ReportQuery): Promise<FinanceResourceReport>;
  aging(actor: FinanceV2Actor, asOf: string): Promise<FinanceAging>;
  importPreview(actor: FinanceV2Actor, input: FinanceHistoryPreviewInput): Promise<FinanceHistoryPreview>;
  bankStatementPreview(actor: FinanceV2Actor, input: FinanceBankStatementPreviewInput): Promise<FinanceBankStatementPreview>;
  bankMatchPreview(actor: FinanceV2Actor, input: FinanceBankMatchPreviewInput): Promise<FinanceBankMatchPreview>;
  planningPreview(actor: FinanceV2Actor, input: FinanceCashProjectionInput): Promise<FinanceCashProjection>;
}
