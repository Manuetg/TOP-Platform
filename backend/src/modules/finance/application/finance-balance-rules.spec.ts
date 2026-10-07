import { FinanceInputError } from '../domain/finance.errors';
import { guardBalanceEvents } from './finance-balance-rules';

describe('Financial balance prefixes', () => {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  it('detects an unsafe historical prefix even if the final balance fits', () => {
    expect(() => guardBalanceEvents([{ accountId: 'cash', instant: 1, amount: max }, { accountId: 'cash', instant: 2, amount: 1n }, { accountId: 'cash', instant: 3, amount: -1n }])).toThrow(FinanceInputError);
    expect(() => guardBalanceEvents([{ accountId: 'cash', instant: 3, amount: -1n }, { accountId: 'cash', instant: 1, amount: max }, { accountId: 'cash', instant: 2, amount: 1n }])).toThrow(FinanceInputError);
  });
  it('detects negative overflow and consolidated overflow', () => {
    expect(() => guardBalanceEvents([{ accountId: 'cash', instant: 1, amount: -max }, { accountId: 'cash', instant: 2, amount: -1n }])).toThrow(FinanceInputError);
    expect(() => guardBalanceEvents([{ accountId: 'cash', instant: 1, amount: max }, { accountId: 'bank', instant: 1, amount: 1n }])).toThrow(FinanceInputError);
  });
  it('groups same-instant transfer legs before consolidating and uses chronological order', () => {
    expect(() => guardBalanceEvents([{ accountId: 'cash', instant: 2, amount: max }, { accountId: 'bank', instant: 2, amount: -max }, { accountId: 'bank', instant: 1, amount: max }])).not.toThrow();
  });
  it('allows safe negative account balances and an empty configured set', () => {
    expect(() => guardBalanceEvents([{ accountId: 'cash', instant: 1, amount: -900000n }])).not.toThrow();
    expect(() => guardBalanceEvents([])).not.toThrow();
  });
});
