import { FinanceInputError } from './finance.errors';
import { expenseBalance, safeMoney, sumMoney } from './finance-money';

describe('Finance PYG money', () => {
  it.each([0n, 450000n, -450000n, BigInt(Number.MAX_SAFE_INTEGER), -BigInt(Number.MAX_SAFE_INTEGER)])(
    'serializes exact signed PYG %s without scaling', value => {
      expect(safeMoney(value)).toBe(Number(value));
    },
  );

  it.each([BigInt(Number.MAX_SAFE_INTEGER) + 1n, -BigInt(Number.MAX_SAFE_INTEGER) - 1n])(
    'rejects an unsafe bigint %s', value => {
      expect(() => safeMoney(value)).toThrow(FinanceInputError);
    },
  );

  it('sums with BigInt even when intermediate numbers exceed the safe range', () => {
    expect(sumMoney([Number.MAX_SAFE_INTEGER, 1, -Number.MAX_SAFE_INTEGER])).toBe(1);
    expect(sumMoney([60000, 40001])).toBe(100001);
    expect(sumMoney([])).toBe(0);
  });

  it.each([[Number.MAX_SAFE_INTEGER, 1], [-Number.MAX_SAFE_INTEGER, -1], [0.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1]])(
    'rejects unsafe sum values %j', (...values: number[]) => {
      expect(() => sumMoney(values)).toThrow(FinanceInputError);
    },
  );

  it('derives the partial obligation without changing the original cost', () => {
    expect(expenseBalance(900000, 300000)).toBe(600000);
    expect(expenseBalance(900000, 900000)).toBe(0);
    expect(expenseBalance(0, 0)).toBe(0);
  });

  it.each([[-1, 0], [1, -1], [900000, 900001], [1.5, 0], [1, 0.5], [Infinity, 0], [1, NaN]])(
    'rejects invalid or overapplied obligation (%s, %s)', (total, paid) => {
      expect(() => expenseBalance(total, paid)).toThrow(FinanceInputError);
    },
  );
});
