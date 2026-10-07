import type { FinanceExpense } from '../domain/finance.types';
import { safeMoney, sumMoney, expenseBalance } from '../domain/finance-money';
import type { FinanceExpenseRow } from './finance-prisma-context';

export function mapFinanceExpense(row: FinanceExpenseRow, today: string): FinanceExpense {
  const amountMinor = safeMoney(row.amountMinor);
  const paidAmountMinor = sumMoney(row.settlements.map((settlement) => safeMoney(settlement.amountMinor)));
  const outstandingMinor = expenseBalance(amountMinor, paidAmountMinor);
  const dueOn = row.dueOn?.toISOString().slice(0, 10) ?? null;
  return {
    id: row.id, description: row.description, consumedOn: row.consumedOn.toISOString().slice(0, 10), dueOn,
    counterpartyId: row.counterpartyId, counterpartyName: row.counterparty?.name ?? null,
    reference: row.reference, evidenceMissing: !row.reference && row.evidenceFiles.length === 0, amountMinor, paidAmountMinor, outstandingMinor,
    overdue: dueOn !== null && dueOn < today && outstandingMinor > 0, version: row.version,
    recordedByUserId: row.recordedByUserId, createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({ id: line.id, label: line.label, categoryId: line.categoryId, categoryName: line.category.name, resourceId: line.resourceId, resourceName: line.resource?.name ?? null, amountMinor: safeMoney(line.amountMinor), operational: line.operational })),
    settlements: row.settlements.map((settlement) => ({ id: settlement.id, accountId: settlement.accountId, amountMinor: safeMoney(settlement.amountMinor), occurredAt: settlement.occurredAt.toISOString(), reference: settlement.reference, recordedByUserId: settlement.recordedByUserId })),
  };
}
