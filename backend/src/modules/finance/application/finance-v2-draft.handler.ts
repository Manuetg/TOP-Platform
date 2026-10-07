import type { ExpenseDefinition, FinanceExpenseDraftDto, FinanceV2Mutation, FinanceV2Result, FinanceApprovalPolicyDto, FinanceReimbursementDto, SettlementInputV2 } from '../domain/finance-v2.types';
import { FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
import { parseFinanceUuid } from '../domain/finance-validation';
import { planningDate } from './finance-v2-planning.rules';
import { requireDraftDecision, requireDraftSubmission, requireDraftWithdrawal, requireEditableDraft, requireExactVersion, requireExpenseConfirmation } from './finance-v2-policy.rules';

export interface DraftWriteInput {
  expenseDefinition: ExpenseDefinition; consumedOn: string; dueOn: string | null;
  reimbursement: FinanceReimbursementDto | null;
}
export interface DraftStatePatch {
  state: FinanceExpenseDraftDto['state']; approvalPolicyRevisionId?: string | null;
  submissionVersion?: number | null; confirmedExpenseId?: string | null;
}
export interface FinanceDraftStore {
  policy(businessId: string, revisionId?: string | null): Promise<FinanceApprovalPolicyDto>;
  draft(businessId: string, id: string): Promise<FinanceExpenseDraftDto | null>;
  validateDefinition(businessId: string, definition: ExpenseDefinition): Promise<void>;
  createDraft(input: FinanceV2Mutation, definition: DraftWriteInput): Promise<FinanceExpenseDraftDto>;
  editDraft(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, definition: DraftWriteInput): Promise<FinanceExpenseDraftDto>;
  changeDraftState(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, patch: DraftStatePatch): Promise<FinanceExpenseDraftDto>;
  createDecision(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, decision: 'APPROVE' | 'REJECT', reason: string): Promise<void>;
  appendPolicy(input: FinanceV2Mutation, nextVersion: number): Promise<FinanceApprovalPolicyDto>;
  confirmDraftExpense(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, settlement: SettlementInputV2 | null): Promise<{ expenseId: string; claimId?: string }>;
  reimburseExpense(input: FinanceV2Mutation, expenseId: string, expectedVersion: number, settlement: SettlementInputV2): Promise<{ id: string; version: number; settlementId: string }>;
}

export function validateExpenseDefinition(definition: ExpenseDefinition): void {
  validateExpenseDescription(definition);
  if (!Number.isSafeInteger(definition.amountMinor) || definition.amountMinor <= 0) throw new FinanceInputError('El gasto requiere importe PYG positivo.');
  if (!Array.isArray(definition.lines) || definition.lines.length < 1 || definition.lines.length > 50) throw new FinanceInputError('Un gasto requiere entre 1 y 50 líneas.');
  definition.lines.forEach(validateExpenseLine);
  if (sumMoney(definition.lines.map(line => line.amountMinor)) !== definition.amountMinor) throw new FinanceInputError('Las líneas deben conservar exactamente el importe del gasto.');
}
function validateExpenseDescription(definition:ExpenseDefinition):void{
  if (!definition || typeof definition.description !== 'string' || !definition.description.trim() || definition.description.length > 500) throw new FinanceInputError('Descripción de gasto inválida.');
}
function validateExpenseLine(line: ExpenseDefinition['lines'][number]): void {
  parseFinanceUuid(line.categoryId);
  if (line.resourceId !== null) parseFinanceUuid(line.resourceId);
  if (line.bookingId !== null) parseFinanceUuid(line.bookingId);
  if (typeof line.label !== 'string' || !line.label.trim() || line.label.length > 120 || typeof line.operational !== 'boolean' || !Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) throw new FinanceInputError('Línea de gasto inválida.');
}

function validateDraftInput(definition: DraftWriteInput): void {
  validateExpenseDefinition(definition.expenseDefinition);
  planningDate(definition.consumedOn);
  if (definition.dueOn !== null) planningDate(definition.dueOn);
  if (definition.reimbursement) {
    planningDate(definition.reimbursement.externallyPaidOn);
    if (definition.expenseDefinition.counterpartyId !== definition.reimbursement.creditorCounterpartyId) throw new FinanceInputError('El acreedor del reintegro debe coincidir con la obligación.');
  }
}

async function findDraft(store: FinanceDraftStore, input: FinanceV2Mutation, id: string): Promise<FinanceExpenseDraftDto> {
  const draft = await store.draft(input.businessId, id);
  if (!draft || draft.businessId !== input.businessId) throw new FinanceNotFoundError('Borrador no disponible.');
  return draft;
}

export async function handleFinanceDraftCommand(store: FinanceDraftStore, input: FinanceV2Mutation): Promise<FinanceV2Result> {
  const command = input.command;
  if (command.type === 'CREATE_EXPENSE_DRAFT' || command.type === 'CREATE_REIMBURSEMENT_DRAFT') {
    const reimbursement = command.type === 'CREATE_REIMBURSEMENT_DRAFT' ? {
      creditorCounterpartyId: command.creditorCounterpartyId, supplierCounterpartyId: command.supplierCounterpartyId,
      externallyPaidOn: command.externallyPaidOn, privateReference: command.privateReference,
    } : null;
    const definition = { expenseDefinition: command.expenseDefinition, consumedOn: command.consumedOn, dueOn: command.dueOn, reimbursement };
    validateDraftInput(definition);
    await store.validateDefinition(input.businessId, definition.expenseDefinition);
    const draft = await store.createDraft(input, definition);
    return { id: draft.id, version: draft.version, type: command.type };
  }
  if (command.type === 'SET_EXPENSE_APPROVAL_POLICY') {
    const current = await store.policy(input.businessId);
    requireExactVersion(current.version, command.expectedPolicyVersion);
    if (command.scope !== 'ALL_NEW_EXPENSE_CONFIRMATIONS' || command.requireDifferentActor !== true || typeof command.enabled !== 'boolean') throw new FinanceInputError('Política de aprobación no soportada.');
    const policy = await store.appendPolicy(input, current.version + 1);
    return { id: policy.id!, version: policy.version, type: command.type };
  }
  if (command.type === 'REIMBURSE_EXPENSE') {
    const result = await store.reimburseExpense(input, command.expenseId, command.expectedVersion, command.settlement);
    return { id: result.id, version: result.version, type: command.type, relatedIds: { settlementId: result.settlementId } };
  }
  if (!('id' in command)) throw new FinanceInputError('Comando de borrador no soportado.');
  const draft = await findDraft(store, input, command.id);
  return mutateFinanceDraft(store, input, draft);
}

async function mutateFinanceDraft(store: FinanceDraftStore, input: FinanceV2Mutation, draft: FinanceExpenseDraftDto): Promise<FinanceV2Result> {
  const command = input.command;
  if (command.type === 'EDIT_EXPENSE_DRAFT') {
    requireEditableDraft(draft, command.expectedVersion);
    const definition = { expenseDefinition: command.expenseDefinition, consumedOn: command.consumedOn, dueOn: command.dueOn, reimbursement: draft.reimbursement };
    validateDraftInput(definition);
    await store.validateDefinition(input.businessId, definition.expenseDefinition);
    const updated = await store.editDraft(input, draft, definition);
    return { id: updated.id, version: updated.version, type: command.type };
  }
  if (command.type === 'SUBMIT_EXPENSE_DRAFT') {
    requireDraftSubmission(draft, command.expectedVersion);
    const policy = await store.policy(input.businessId);
    requireExactVersion(policy.version, command.expectedPolicyVersion);
    const updated = await store.changeDraftState(input, draft, { state: 'SUBMITTED', approvalPolicyRevisionId: policy.id, submissionVersion: draft.version + 1 });
    return { id: updated.id, version: updated.version, type: command.type };
  }
  if (command.type === 'WITHDRAW_EXPENSE_DRAFT') {
    requireDraftWithdrawal(draft, command.expectedVersion);
    const updated = await store.changeDraftState(input, draft, { state: 'DRAFT', approvalPolicyRevisionId: null, submissionVersion: null });
    return { id: updated.id, version: updated.version, type: command.type };
  }
  if (command.type === 'DECIDE_EXPENSE_DRAFT') {
    const policy = await store.policy(input.businessId, command.policyRevisionId);
    requireDraftDecision(draft, policy, command.expectedVersion, input.actorUserId, true);
    if (command.decision !== 'APPROVE' && command.decision !== 'REJECT') throw new FinanceInputError('Decisión inválida.');
    await store.createDecision(input, draft, command.decision, command.reason);
    const updated = await store.changeDraftState(input, draft, { state: command.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' });
    return { id: updated.id, version: updated.version, type: command.type };
  }
  if (command.type === 'CONFIRM_EXPENSE_DRAFT') return confirmFinanceDraft(store, input, draft, command.expectedVersion, command.settlement);
  throw new FinanceInputError('Comando de borrador no soportado.');
}

async function confirmFinanceDraft(store: FinanceDraftStore, input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, expectedVersion: number, settlement: SettlementInputV2 | null): Promise<FinanceV2Result> {
  requireExactVersion(draft.version, expectedVersion);
  const policy = await store.policy(input.businessId, draft.submissionVersion === null ? undefined : draft.approvalPolicyRevisionId);
  requireExpenseConfirmation(policy, draft);
  if (draft.reimbursement && settlement !== null) throw new FinanceInputError('El pago previo de un reintegro no usa caja propia.');
  await store.validateDefinition(input.businessId, draft);
  const created = await store.confirmDraftExpense(input, draft, settlement);
  const updated = await store.changeDraftState(input, draft, { state: 'CONFIRMED', confirmedExpenseId: created.expenseId });
  return { id: updated.id, version: updated.version, type: input.command.type, relatedIds: { expenseId: created.expenseId, claimId: created.claimId } };
}
