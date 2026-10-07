import { FinanceInputError } from './finance.errors';

const MAX_MONEY = BigInt(Number.MAX_SAFE_INTEGER);

export function safeMoney(value: bigint): number {
  if (value > MAX_MONEY || value < -MAX_MONEY) {
    throw new FinanceInputError('El importe supera el rango de enteros seguros PYG.');
  }
  return Number(value);
}

export function sumMoney(values: number[]): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) {
      throw new FinanceInputError('Los importes PYG deben ser enteros seguros.');
    }
    return sum + BigInt(value);
  }, 0n);
  return safeMoney(total);
}

export function expenseBalance(total: number, paid: number): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(paid)) {
    throw new FinanceInputError('Los importes PYG deben ser enteros seguros.');
  }
  if (total < 0 || paid < 0 || paid > total) {
    throw new FinanceInputError('Los pagos no pueden superar la obligación.');
  }
  return safeMoney(BigInt(total) - BigInt(paid));
}
