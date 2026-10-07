import type { FinanceCommand, FinanceMutation, FinanceResult, SettlementInput } from '../domain/finance.types';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { requireExpenseLines, requireFinanceOpening, requireSettlementAvailable } from '../application/finance-command-rules';
import { safeMoney, sumMoney } from '../domain/finance-money';
import { findFinanceAccount, findFinanceExpense, financeJson, type FinanceTransaction } from './finance-prisma-context';

type ExpenseCommand = Extract<FinanceCommand, { type: 'CREATE_EXPENSE' | 'SETTLE_EXPENSE' | 'SET_EVIDENCE' }>;

async function validateExpenseReferences(tx: FinanceTransaction, businessId: string, command: Extract<FinanceCommand, { type: 'CREATE_EXPENSE' }>): Promise<void> {
  const categoryIds = [...new Set(command.lines.map((line) => line.categoryId))];
  const categories = await tx.financeCatalog.count({ where: { id: { in: categoryIds }, businessId, kind: 'CATEGORY', archived: false } });
  if (categories !== categoryIds.length) throw new FinanceNotFoundError('Categoría no disponible.');
  if (command.counterpartyId) {
    const counterparty = await tx.financeCatalog.findFirst({ where: { id: command.counterpartyId, businessId, kind: 'COUNTERPARTY', archived: false } });
    if (!counterparty) throw new FinanceNotFoundError('Contraparte no disponible.');
  }
  const resourceIds = [...new Set(command.lines.map((line) => line.resourceId).filter((id): id is string => id !== null))];
  const resources = await tx.resource.count({ where: { id: { in: resourceIds }, businessId } });
  if (resources !== resourceIds.length) throw new FinanceNotFoundError('Recurso no disponible.');
}

async function createSettlement(tx: FinanceTransaction, input: FinanceMutation, expenseId: string, total: number, paid: number, settlement: SettlementInput): Promise<void> {
  requireSettlementAvailable(total, paid, settlement.amountMinor);
  const account = await findFinanceAccount(tx, input.businessId, settlement.accountId);
  requireFinanceOpening(account.opening, new Date(settlement.occurredAt));
  await tx.financeSettlement.create({ data: { businessId: input.businessId, expenseId, accountId: account.id, amountMinor: BigInt(settlement.amountMinor), occurredAt: new Date(settlement.occurredAt), reference: settlement.reference, recordedByUserId: input.actorUserId } });
}

export async function writeFinanceExpense(tx: FinanceTransaction, input: FinanceMutation, command: ExpenseCommand): Promise<FinanceResult> {
  if (command.type === 'CREATE_EXPENSE') return createExpense(tx, input, command);
  const expense = await findFinanceExpense(tx, input.businessId, command.id, command.expectedVersion);
  if (command.type === 'SET_EVIDENCE') {
    if (expense.reference === command.reference) return { id: expense.id, version: expense.version, type: command.type };
    await tx.financeAudit.create({ data: { businessId: input.businessId, action: 'EVIDENCE_DIFFERENTIAL', sourceId: expense.id, actorUserId: input.actorUserId, details: financeJson({ before: expense.reference, after: command.reference, reason: command.reason, beforeVersion: expense.version, afterVersion: expense.version + 1 }) } });
    const updated = await tx.financeExpense.update({ where: { id: expense.id }, data: { reference: command.reference, version: { increment: 1 } } });
    return { id: updated.id, version: updated.version, type: command.type };
  }
  const paid = sumMoney(expense.settlements.map((settlement) => safeMoney(settlement.amountMinor)));
  await createSettlement(tx, input, expense.id, safeMoney(expense.amountMinor), paid, command.settlement);
  const updated = await tx.financeExpense.update({ where: { id: expense.id }, data: { version: { increment: 1 } } });
  return { id: updated.id, version: updated.version, type: command.type };
}

async function createExpense(tx: FinanceTransaction, input: FinanceMutation, command: Extract<FinanceCommand, { type: 'CREATE_EXPENSE' }>): Promise<FinanceResult> {
  requireExpenseLines(command.amountMinor, command.lines);
  await validateExpenseReferences(tx, input.businessId, command);
  if (command.settlement && command.settlement.amountMinor > command.amountMinor) throw new FinanceConflictError('La liquidación supera la obligación.');
  const expense = await tx.financeExpense.create({ data: { businessId: input.businessId, description: command.description, consumedOn: new Date(command.consumedOn), dueOn: command.dueOn ? new Date(command.dueOn) : null, counterpartyId: command.counterpartyId, reference: command.reference, amountMinor: BigInt(command.amountMinor), recordedByUserId: input.actorUserId } });
  await tx.financeExpenseLine.createMany({ data: command.lines.map((line) => ({ ...line, businessId: input.businessId, expenseId: expense.id, amountMinor: BigInt(line.amountMinor) })) });
  if (command.settlement) await createSettlement(tx, input, expense.id, command.amountMinor, 0, command.settlement);
  return { id: expense.id, version: expense.version, type: command.type };
}
