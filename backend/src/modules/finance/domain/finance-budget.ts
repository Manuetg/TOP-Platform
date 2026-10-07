import { FinanceInputError } from './finance.errors';
import { safeMoney } from './finance-money';

export interface BudgetComparison {
  readonly approvedMinor: number;
  readonly actualMinor: number;
  readonly committedPendingMinor: number;
  readonly forecastMinor: number | null;
  readonly actualDeviationMinor: number;
  readonly forecastDeviationMinor: number | null;
}

function nonnegativeMoney(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FinanceInputError('Los importes PYG deben ser enteros seguros no negativos.');
  }
  return BigInt(value);
}

export function compareBudget(approved: number, actual: number, committedPending: number, forecast: number | null): BudgetComparison {
  const approvedAmount = nonnegativeMoney(approved);
  const actualAmount = nonnegativeMoney(actual);
  nonnegativeMoney(committedPending);
  const forecastAmount = forecast === null ? null : nonnegativeMoney(forecast);
  return Object.freeze({
    approvedMinor: approved, actualMinor: actual, committedPendingMinor: committedPending, forecastMinor: forecast,
    actualDeviationMinor: safeMoney(actualAmount - approvedAmount),
    forecastDeviationMinor: forecastAmount === null ? null : safeMoney(forecastAmount - approvedAmount),
  });
}

export function consumeCommitment(total: number, alreadyConsumed: number, newExpense: number): number {
  const totalAmount = nonnegativeMoney(total);
  const consumedAmount = nonnegativeMoney(alreadyConsumed);
  const expenseAmount = nonnegativeMoney(newExpense);
  if (expenseAmount === 0n) throw new FinanceInputError('El nuevo gasto debe ser positivo.');
  const remaining = totalAmount - consumedAmount - expenseAmount;
  if (consumedAmount > totalAmount || remaining < 0n) {
    throw new FinanceInputError('La conversión no puede superar el compromiso pendiente.');
  }
  return safeMoney(remaining);
}
