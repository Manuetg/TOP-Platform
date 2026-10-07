import { sumMoney } from '../domain/finance-money';
import { evidenceDigest, evidenceInstant, evidenceUuid, FinanceEvidenceError, issue, requireEvidenceBankAccount, requireSignedCapacity } from './finance-v2-evidence.validation';
import { planBankFees } from './finance-v2-bank-fees';
import { bankResidual, bankSourceKey, suggestBankMatches, validateBankComponent, validateBankPaymentLinks } from './finance-v2-bank-source';
import type { BankFeePlan, BankMatchInput, BankMatchPreview, BankMatchSnapshot, BankSourceSnapshot, BankValidatedComponent } from './finance-v2-bank.types';
export { BANK_CSV_HEADER, parseBankStatementCsv, previewBankStatement, requireBankStatementConfirmation } from './finance-v2-bank-statement';
export { bankSourceKey, bankSourceForeignKeys, suggestBankMatches } from './finance-v2-bank-source';
export { planBankFees } from './finance-v2-bank-fees';
export type * from './finance-v2-bank.types';

function context(input: BankMatchInput, snapshot: BankMatchSnapshot): void {
  evidenceUuid(input.accountId, 'accountId');
  evidenceInstant(snapshot.now, 'now');
  if (input.businessId !== snapshot.businessId) throw new FinanceEvidenceError('BUSINESS_MISMATCH');
  requireEvidenceBankAccount(snapshot.account, input.businessId, input.accountId);
  if (input.rows.length < 1 || input.rows.length > 100) throw new FinanceEvidenceError('MATCH_ROW_LIMIT', 'rows');
  const sourceCount = input.components.length + input.fees.filter(fee => 'expenseDefinition' in fee).length;
  if (sourceCount < 1 || sourceCount > 200) throw new FinanceEvidenceError('MATCH_COMPONENT_LIMIT', 'components');
}
function rows(input: BankMatchInput, snapshot: BankMatchSnapshot, result: BankMatchPreview): void {
  const keys = new Set<string>();
  for (const row of input.rows) {
    evidenceUuid(row.id, 'id');
    if (keys.has(row.id)) throw new FinanceEvidenceError('MATCH_ROW_DUPLICATE', 'rows');
    keys.add(row.id);
    const source = snapshot.rows.find(item => item.id === row.id && item.businessId === input.businessId && item.accountId === input.accountId);
    if (!source) throw new FinanceEvidenceError('BANK_ROW_NOT_FOUND', 'id');
    if (!Number.isSafeInteger(row.version) || row.version < 1 || source.version !== row.version) throw new FinanceEvidenceError('BANK_ROW_STALE', 'version');
    requireSignedCapacity(row.amountMinor, source.amountMinor, source.reservedMinor);
    result.rows.push(bankResidual(row.id, source.amountMinor, source.reservedMinor, row.amountMinor));
  }
  result.rowTotalMinor = sumMoney(input.rows.map(row => row.amountMinor));
}
function components(input: BankMatchInput, snapshot: BankMatchSnapshot, result: BankMatchPreview): void {
  const keys = new Set<string>();
  for (const component of input.components) {
    const key = bankSourceKey(component);
    if (keys.has(key)) throw new FinanceEvidenceError('MATCH_SOURCE_DUPLICATE', 'components');
    keys.add(key);
    const validated = validateBankComponent(component, input, snapshot);
    result.components.push(validated.component);
    result.sources.push(bankResidual(key, validated.source.amountMinor, validated.source.reservedMinor, component.amountMinor));
  }
}
function canonicalInput(input: BankMatchInput): unknown {
  return { businessId: input.businessId, accountId: input.accountId, rows: [...input.rows].sort((a, b) => a.id.localeCompare(b.id)), components: [...input.components].sort((a, b) => bankSourceKey(a).localeCompare(bankSourceKey(b))), paymentLinks: [...input.paymentLinks].sort((a, b) => a.paymentId.localeCompare(b.paymentId)), fees: [...input.fees].sort((a, b) => a.bankRowId.localeCompare(b.bankRowId)) };
}
function previewToken(input: BankMatchInput, snapshot: BankMatchSnapshot): string {
  const sourceKeys = new Set(input.components.map(bankSourceKey));
  const rowIds = new Set(input.rows.map(row => row.id));
  return evidenceDigest({ input: canonicalInput(input), timeZone: snapshot.timeZone, account: snapshot.account, policy: snapshot.policy,
    rows: snapshot.rows.filter(row => rowIds.has(row.id)).sort((a, b) => a.id.localeCompare(b.id)),
    sources: snapshot.sources.filter(source => sourceKeys.has(bankSourceKey(source))).sort((a, b) => bankSourceKey(a).localeCompare(bankSourceKey(b))),
    feeOrigins: snapshot.feeOrigins.filter(origin => rowIds.has(origin.bankRowId)).sort((a, b) => a.bankRowId.localeCompare(b.bankRowId)),
    feeReferences: [...snapshot.feeReferences].sort((a, b) => a.id.localeCompare(b.id)), existingFees: [...snapshot.existingFees].sort((a, b) => a.settlementId.localeCompare(b.settlementId)),
  });
}
export function previewBankMatch(input: BankMatchInput, snapshot: BankMatchSnapshot): BankMatchPreview {
  const result: BankMatchPreview = { valid: false, errors: [], staleReasons: [], previewToken: null, rowTotalMinor: null, componentTotalMinor: null, plannedFeeTotalMinor: 0, rows: [], sources: [], components: [], fees: [], suggestions: [], registeredCashDeltaMinor: 0 };
  try {
    context(input, snapshot);
    rows(input, snapshot, result);
    validateBankPaymentLinks(input, snapshot);
    components(input, snapshot, result);
    result.fees = planBankFees(input, snapshot);
    result.plannedFeeTotalMinor = sumMoney(result.fees.filter(fee => fee.mode === 'CREATE').map(fee => fee.amountMinor));
    result.componentTotalMinor = sumMoney([...input.components.map(component => component.amountMinor), result.plannedFeeTotalMinor]);
    if (result.rowTotalMinor !== result.componentTotalMinor) throw new FinanceEvidenceError('MATCH_SIGNED_SUM_MISMATCH', 'amountMinor');
    result.suggestions = suggestBankMatches(snapshot);
    result.valid = true;
    result.previewToken = previewToken(input, snapshot);
  } catch (error) {
    const detail = issue(error);
    result.errors.push(detail);
    if (['SOURCE_STALE', 'SOURCE_NOT_FOUND', 'SOURCE_INELIGIBLE', 'BANK_ROW_STALE', 'PAYMENT_LINK_REQUIRED'].includes(detail.code)) result.staleReasons.push(detail.code);
  }
  return result;
}
export function requireBankMatchConfirmation(input: BankMatchInput, snapshot: BankMatchSnapshot, expectedToken: string): BankMatchPreview {
  const preview = previewBankMatch(input, snapshot);
  if (!preview.valid || preview.previewToken !== expectedToken) throw new FinanceEvidenceError('BANK_MATCH_PREVIEW_STALE');
  return preview;
}
// Called only after the writer has created the real fee Expense and Settlement in its transaction.
function requireBoundFeeIdentity(plan: BankFeePlan, source: BankSourceSnapshot, businessId: string, accountId: string): void {
  if (plan.mode !== 'CREATE' || source.sourceType !== 'SETTLEMENT' || source.sourceLeg !== null || source.businessId !== businessId || source.accountId !== accountId) throw new FinanceEvidenceError('FEE_BOUND_SOURCE_INVALID', 'settlementId');
}
function requireBoundFeeEconomics(plan: BankFeePlan, source: BankSourceSnapshot): void {
  if (!source.eligible || source.currency !== 'PYG' || source.amountMinor !== plan.amountMinor || source.reservedMinor !== 0) throw new FinanceEvidenceError('FEE_BOUND_SOURCE_INVALID', 'settlementId');
  if (!Number.isSafeInteger(source.sourceVersion) || source.sourceVersion < 1 || !/^[0-9a-f]{64}$/.test(source.sourceHash)) throw new FinanceEvidenceError('FEE_BOUND_VERSION_INVALID', 'settlementId');
}
export function bindBankFeeSettlement(plan: BankFeePlan, source: BankSourceSnapshot, expenseId: string, businessId: string, accountId: string): BankValidatedComponent {
  evidenceUuid(expenseId, 'expenseId');
  evidenceUuid(source.sourceId, 'settlementId');
  requireBoundFeeIdentity(plan, source, businessId, accountId);
  requireBoundFeeEconomics(plan, source);
  return { sourceType: 'SETTLEMENT', sourceId: source.sourceId, sourceLeg: null, sourceVersion: source.sourceVersion, sourceHash: source.sourceHash, amountMinor: source.amountMinor, sourceKey: bankSourceKey(source), accountId, paymentId: null, paymentAdjustmentId: null, settlementId: source.sourceId, transferId: null, cashMovementId: null };
}
