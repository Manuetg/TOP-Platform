import { sumMoney } from '../domain/finance-money';
import { evidenceDate, evidenceInstant, evidenceText, evidenceUuid, FinanceEvidenceError } from './finance-v2-evidence.validation';
import type { BankFeeExpenseDefinition, BankFeeInput, BankFeePlan, BankMatchInput, BankMatchSnapshot } from './finance-v2-bank.types';

function ref(id: string, kind: 'CATEGORY' | 'COUNTERPARTY' | 'RESOURCE' | 'BOOKING', snapshot: BankMatchSnapshot): BankMatchSnapshot['feeReferences'][number] {
  evidenceUuid(id, kind);
  const found = snapshot.feeReferences.find(item => item.id === id && item.businessId === snapshot.businessId && item.kind === kind);
  if (!found) throw new FinanceEvidenceError('FEE_REFERENCE_NOT_FOUND', kind);
  if (found.archived) throw new FinanceEvidenceError('FEE_REFERENCE_UNAVAILABLE', kind);
  return found;
}
function positiveAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new FinanceEvidenceError('FEE_AMOUNT_INVALID', 'amountMinor');
}
function feeLine(line: BankFeeExpenseDefinition['lines'][number], snapshot: BankMatchSnapshot): void {
  positiveAmount(line.amountMinor);
  evidenceText(line.label, 'label', 120);
  if (typeof line.operational !== 'boolean') throw new FinanceEvidenceError('BOOLEAN_INVALID', 'operational');
  ref(line.categoryId, 'CATEGORY', snapshot);
  if (line.resourceId) ref(line.resourceId, 'RESOURCE', snapshot);
  if (line.bookingId && ref(line.bookingId, 'BOOKING', snapshot).resourceId !== line.resourceId) throw new FinanceEvidenceError('BOOKING_RESOURCE_MISMATCH', 'bookingId');
}
function definition(expense: BankFeeExpenseDefinition, snapshot: BankMatchSnapshot): void {
  positiveAmount(expense.amountMinor);
  evidenceText(expense.description, 'description', 240);
  if (expense.counterpartyId) ref(expense.counterpartyId, 'COUNTERPARTY', snapshot);
  if (expense.reference !== null) evidenceText(expense.reference, 'reference', 500);
  if (expense.lines.length < 1 || expense.lines.length > 50) throw new FinanceEvidenceError('FEE_LINE_LIMIT', 'lines');
  for (const line of expense.lines) feeLine(line, snapshot);
  if (sumMoney(expense.lines.map(line => line.amountMinor)) !== expense.amountMinor) throw new FinanceEvidenceError('FEE_SUM_MISMATCH', 'amountMinor');
}
function existingFee(fee: BankFeeInput & { existingExpenseId: string; existingSettlementId: string }, input: BankMatchInput, snapshot: BankMatchSnapshot): BankFeePlan {
  evidenceUuid(fee.existingExpenseId, 'existingExpenseId');
  evidenceUuid(fee.existingSettlementId, 'existingSettlementId');
  const found = snapshot.existingFees.find(item => item.businessId === input.businessId && item.expenseId === fee.existingExpenseId && item.settlementId === fee.existingSettlementId);
  if (!found || found.accountId !== input.accountId || !found.eligible) throw new FinanceEvidenceError('FEE_EXISTING_SOURCE_INVALID', 'existingSettlementId');
  positiveAmount(found.expenseAmountMinor);
  if (found.expenseAmountMinor !== found.settlementAmountMinor) throw new FinanceEvidenceError('FEE_PAYMENT_TOTAL_MISMATCH', 'existingSettlementId');
  const component = input.components.find(item => item.sourceType === 'SETTLEMENT' && item.sourceId === fee.existingSettlementId);
  if (!component || component.amountMinor !== -found.settlementAmountMinor) throw new FinanceEvidenceError('FEE_COMPONENT_REQUIRED', 'components');
  const usedElsewhere = snapshot.feeOrigins.some(origin => origin.businessId === input.businessId && origin.bankRowId !== fee.bankRowId && (origin.expenseId === fee.existingExpenseId || origin.settlementId === fee.existingSettlementId));
  if (usedElsewhere) throw new FinanceEvidenceError('FEE_ORIGIN_CONFLICT', 'bankRowId');
  return { bankRowId: fee.bankRowId, mode: 'EXISTING', amountMinor: -found.settlementAmountMinor, expenseId: found.expenseId, settlementId: found.settlementId, input: fee };
}
function newFee(fee: BankFeeInput & { expenseDefinition: BankFeeExpenseDefinition; consumedOn: string; occurredAt: string; reference: string | null }, snapshot: BankMatchSnapshot): BankFeePlan {
  if (snapshot.policy.enabled) throw new FinanceEvidenceError('EXPENSE_APPROVAL_REQUIRED', 'fees');
  definition(fee.expenseDefinition, snapshot);
  evidenceDate(fee.consumedOn, 'consumedOn');
  const occurredAt = evidenceInstant(fee.occurredAt, 'occurredAt');
  if (fee.reference !== null) evidenceText(fee.reference, 'reference', 500);
  if (!snapshot.account.opening) throw new FinanceEvidenceError('OPENING_REQUIRED', 'accountId');
  if (Date.parse(occurredAt) < Date.parse(snapshot.account.opening.occurredAt) || Date.parse(occurredAt) > Date.parse(snapshot.now)) throw new FinanceEvidenceError('FEE_OCCURRED_AT_INVALID', 'occurredAt');
  return { bankRowId: fee.bankRowId, mode: 'CREATE', amountMinor: -fee.expenseDefinition.amountMinor, expenseId: null, settlementId: null, input: fee };
}
function planFee(fee: BankFeeInput, input: BankMatchInput, snapshot: BankMatchSnapshot): BankFeePlan {
  const origin = snapshot.feeOrigins.find(item => item.businessId === input.businessId && item.bankRowId === fee.bankRowId);
  const isExisting = 'existingExpenseId' in fee;
  if (isExisting === ('expenseDefinition' in fee)) throw new FinanceEvidenceError('FEE_SOURCE_XOR', 'fees');
  if (origin && (!isExisting || origin.expenseId !== fee.existingExpenseId || origin.settlementId !== fee.existingSettlementId)) throw new FinanceEvidenceError('FEE_ORIGIN_CONFLICT', 'bankRowId');
  return isExisting ? existingFee(fee, input, snapshot) : newFee(fee, snapshot);
}
export function planBankFees(input: BankMatchInput, snapshot: BankMatchSnapshot): BankFeePlan[] {
  const bankRows = new Set<string>();
  const settlements = new Set<string>();
  return input.fees.map(fee => {
    evidenceUuid(fee.bankRowId, 'bankRowId');
    if (!input.rows.some(row => row.id === fee.bankRowId) || bankRows.has(fee.bankRowId)) throw new FinanceEvidenceError('FEE_ROW_INVALID', 'bankRowId');
    bankRows.add(fee.bankRowId);
    const plan = planFee(fee, input, snapshot);
    if (plan.settlementId && settlements.has(plan.settlementId)) throw new FinanceEvidenceError('FEE_SOURCE_DUPLICATE', 'existingSettlementId');
    if (plan.settlementId) settlements.add(plan.settlementId);
    return plan;
  });
}
