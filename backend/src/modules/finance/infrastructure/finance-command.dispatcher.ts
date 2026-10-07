import type { FinanceCommand, FinanceMutation, FinanceResult } from '../domain/finance.types';
import { writeFinanceCatalog, writeFinanceAccount } from './finance-catalog-account.writer';
import { writeFinanceExpense } from './finance-expense.writer';
import { writeFinanceMoney } from './finance-money.writer';
import { writeFinanceCashCount } from './finance-cash-count.writer';
import { writeFinanceReview } from './finance-review.writer';
import type { FinanceTransaction } from './finance-prisma-context';

export function dispatchFinanceCommand(tx: FinanceTransaction, input: FinanceMutation): Promise<FinanceResult> {
  const command = input.command;
  const actions: Record<FinanceCommand['type'], () => Promise<FinanceResult>> = {
    CREATE_CATALOG: () => writeFinanceCatalog(tx, input, command as Extract<FinanceCommand, { type: 'CREATE_CATALOG' }>),
    ARCHIVE_CATALOG: () => writeFinanceCatalog(tx, input, command as Extract<FinanceCommand, { type: 'ARCHIVE_CATALOG' }>),
    CREATE_ACCOUNT: () => writeFinanceAccount(tx, input, command as Extract<FinanceCommand, { type: 'CREATE_ACCOUNT' }>),
    ARCHIVE_ACCOUNT: () => writeFinanceAccount(tx, input, command as Extract<FinanceCommand, { type: 'ARCHIVE_ACCOUNT' }>),
    OPEN_ACCOUNT: () => writeFinanceAccount(tx, input, command as Extract<FinanceCommand, { type: 'OPEN_ACCOUNT' }>),
    CREATE_EXPENSE: () => writeFinanceExpense(tx, input, command as Extract<FinanceCommand, { type: 'CREATE_EXPENSE' }>),
    SETTLE_EXPENSE: () => writeFinanceExpense(tx, input, command as Extract<FinanceCommand, { type: 'SETTLE_EXPENSE' }>),
    SET_EVIDENCE: () => writeFinanceExpense(tx, input, command as Extract<FinanceCommand, { type: 'SET_EVIDENCE' }>),
    LINK_PAYMENT: () => writeFinanceMoney(tx, input, command as Extract<FinanceCommand, { type: 'LINK_PAYMENT' }>),
    TRANSFER: () => writeFinanceMoney(tx, input, command as Extract<FinanceCommand, { type: 'TRANSFER' }>),
    CASH_MOVEMENT: () => writeFinanceMoney(tx, input, command as Extract<FinanceCommand, { type: 'CASH_MOVEMENT' }>),
    COUNT_CASH: () => writeFinanceCashCount(tx, input, command as Extract<FinanceCommand, { type: 'COUNT_CASH' }>),
    ADJUST_COUNT: () => writeFinanceCashCount(tx, input, command as Extract<FinanceCommand, { type: 'ADJUST_COUNT' }>),
    REVIEW_MOVEMENT: () => writeFinanceReview(tx, input, command as Extract<FinanceCommand, { type: 'REVIEW_MOVEMENT' }>),
  };
  return actions[command.type]();
}
