import type { FinanceV2Mutation, FinanceV2Result, FinanceBudgetDto, FinanceBudgetRevisionDto, FinanceCommitmentDto, BudgetLineInput, CommitmentExpenseInput, FinanceExpenseDraftDto } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
import { requireExactVersion } from './finance-v2-policy.rules';
import { planningDate, requireCommitmentConversion } from './finance-v2-planning.rules';
import { validateExpenseDefinition } from './finance-v2-draft.handler';

export interface FinanceBudgetStore {
  budgetByMonth(businessId: string, month: string): Promise<FinanceBudgetDto | null>;
  budgetByRevision(businessId: string, revisionId: string): Promise<{ budget: FinanceBudgetDto; revision: FinanceBudgetRevisionDto } | null>;
  validateBudgetLines(businessId: string, lines: readonly BudgetLineInput[]): Promise<void>;
  appendBudgetRevision(input: FinanceV2Mutation, budget: FinanceBudgetDto | null): Promise<FinanceBudgetDto>;
  approveBudgetRevision(input: FinanceV2Mutation, budget: FinanceBudgetDto, revision: FinanceBudgetRevisionDto): Promise<FinanceBudgetDto>;
  commitment(businessId: string, id: string): Promise<FinanceCommitmentDto | null>;
  createCommitment(input: FinanceV2Mutation): Promise<FinanceCommitmentDto>;
  cancelCommitment(input: FinanceV2Mutation, commitment: FinanceCommitmentDto): Promise<FinanceCommitmentDto>;
  draftForConversion(businessId: string, id: string, expectedVersion: number): Promise<FinanceExpenseDraftDto>;
  convertCommitment(input: FinanceV2Mutation, commitment: FinanceCommitmentDto, expense: CommitmentExpenseInput, draft: FinanceExpenseDraftDto | null): Promise<{ expenseId: string; conversionId: string; version: number }>;
}

export function validateBudgetDimensions(lines: readonly BudgetLineInput[]): void {
  if (!budgetArray(lines) || lines.length < 1 || lines.length > 200) throw new FinanceInputError('Presupuesto requiere entre 1 y 200 dimensiones.');
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.categoryId ?? ''}:${line.resourceId ?? ''}`;
    if (seen.has(key)) throw new FinanceInputError('El presupuesto repite una dimensión, incluido sin asignar.');
    seen.add(key);
    if (!Number.isSafeInteger(line.approvedMinor) || line.approvedMinor < 0) throw new FinanceInputError('Meta PYG inválida.');
  }
  sumMoney(lines.map(line => line.approvedMinor));
}
function budgetArray(value: unknown): boolean { return Array.isArray(value); }

export function validatePeriodMonth(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new FinanceInputError('El período debe ser YYYY-MM.');
  planningDate(`${month}-01`);
}

export async function handleFinanceBudgetCommand(store: FinanceBudgetStore, input: FinanceV2Mutation): Promise<FinanceV2Result> {
  const command = input.command;
  if (command.type === 'CREATE_BUDGET_REVISION') return createFinanceBudgetRevision(store,input);
  if (command.type === 'APPROVE_BUDGET_REVISION') return approveFinanceBudgetRevision(store,input);
  if (command.type === 'CREATE_COMMITMENT') return createFinanceCommitment(store,input);
  if (command.type !== 'CANCEL_COMMITMENT' && command.type !== 'CONVERT_COMMITMENT') throw new FinanceInputError('Comando de planificación no soportado.');
  const commitment = await store.commitment(input.businessId, command.id);
  if (!commitment || commitment.businessId !== input.businessId) throw new FinanceNotFoundError('Compromiso no disponible.');
  requireExactVersion(commitment.version, command.expectedVersion);
  if (commitment.state !== 'ACTIVE') throw new FinanceConflictError('El compromiso no está activo.');
  if (command.type === 'CANCEL_COMMITMENT') {
    const cancelled = await store.cancelCommitment(input, commitment);
    return { id: cancelled.id, version: cancelled.version, type: command.type };
  }
  return convertFinanceCommitment(store, input, commitment);
}
async function createFinanceBudgetRevision(store: FinanceBudgetStore,input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const command = input.command;
    if (command.type !== 'CREATE_BUDGET_REVISION') throw new FinanceInputError('Intención presupuestaria inválida.');
    validatePeriodMonth(command.periodMonth);
    validateBudgetDimensions(command.lines);
    const existing = await store.budgetByMonth(input.businessId, command.periodMonth);
    requireExactVersion(existing?.version ?? 0, command.expectedBudgetVersion);
    await store.validateBudgetLines(input.businessId, command.lines);
    const created = await store.appendBudgetRevision(input, existing);
    return { id: created.id, version: created.version, type: command.type, relatedIds: { revisionId: created.revisions[created.revisions.length - 1].id } };
}
async function approveFinanceBudgetRevision(store: FinanceBudgetStore,input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const command = input.command;
    if (command.type !== 'APPROVE_BUDGET_REVISION') throw new FinanceInputError('Intención de aprobación inválida.');
    const found = await store.budgetByRevision(input.businessId, command.id);
    if (!found) throw new FinanceNotFoundError('Versión presupuestaria no disponible.');
    requireExactVersion(found.budget.version, command.expectedBudgetVersion);
    if (found.revision.approvedAt !== null || found.revision.revisionNo !== found.budget.revisions[found.budget.revisions.length - 1].revisionNo) throw new FinanceConflictError('La versión no es el borrador vigente pendiente de aprobación.');
    const approved = await store.approveBudgetRevision(input, found.budget, found.revision);
    return { id: approved.id, version: approved.version, type: command.type, relatedIds: { revisionId: found.revision.id } };
}
async function createFinanceCommitment(store: FinanceBudgetStore,input: FinanceV2Mutation): Promise<FinanceV2Result> {
    const command = input.command;
    if (command.type !== 'CREATE_COMMITMENT') throw new FinanceInputError('Intención de compromiso inválida.');
    if (!Number.isSafeInteger(command.amountMinor) || command.amountMinor <= 0) throw new FinanceInputError('Compromiso PYG positivo requerido.');
    planningDate(command.expectedConsumptionOn);
    if (command.dueOn !== null) planningDate(command.dueOn);
    await store.validateBudgetLines(input.businessId, [{ categoryId: command.categoryId, resourceId: command.resourceId, approvedMinor: command.amountMinor }]);
    const created = await store.createCommitment(input);
    return { id: created.id, version: created.version, type: command.type };
}

async function convertFinanceCommitment(store: FinanceBudgetStore, input: FinanceV2Mutation, commitment: FinanceCommitmentDto): Promise<FinanceV2Result> {
  const command = input.command;
  if (command.type !== 'CONVERT_COMMITMENT') throw new FinanceInputError('Conversión inválida.');
  const draft = command.expenseDraftId !== null ? await store.draftForConversion(input.businessId, command.expenseDraftId, command.expectedDraftVersion) : null;
  const expense: CommitmentExpenseInput = draft ? { ...draft, settlement: null } : command.expense!;
  validateExpenseDefinition(expense);
  planningDate(expense.consumedOn);
  if (expense.dueOn !== null) planningDate(expense.dueOn);
  requireCommitmentConversion(commitment.amountMinor, commitment.conversions.map(conversion => conversion.consumedMinor), expense.amountMinor);
  if (expense.lines.some(line => line.operational !== commitment.operational || (commitment.categoryId !== null && line.categoryId !== commitment.categoryId) || (commitment.resourceId !== null && line.resourceId !== commitment.resourceId))) throw new FinanceConflictError('El gasto no conserva la dimensión prevista del compromiso.');
  const result = await store.convertCommitment(input, commitment, expense, draft);
  return { id: commitment.id, version: result.version, type: command.type, relatedIds: { expenseId: result.expenseId, conversionId: result.conversionId, draftId: draft?.id } };
}
