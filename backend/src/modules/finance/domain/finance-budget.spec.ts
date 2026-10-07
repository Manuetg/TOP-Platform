import { compareBudget, consumeCommitment } from './finance-budget';
import { FinanceInputError } from './finance.errors';

describe('Finance approved budget comparison', () => {
  it('preserves the approved target separately from actual, pending commitments and forecast', () => {
    expect(compareBudget(1000000, 800000, 300000, 1200000)).toEqual({
      approvedMinor: 1000000, actualMinor: 800000, committedPendingMinor: 300000, forecastMinor: 1200000,
      actualDeviationMinor: -200000, forecastDeviationMinor: 200000,
    });
  });

  it('keeps unknown forecast distinct from a known zero forecast', () => {
    expect(compareBudget(1000000, 0, 0, null)).toMatchObject({ actualDeviationMinor: -1000000, forecastMinor: null, forecastDeviationMinor: null });
    expect(compareBudget(1000000, 0, 0, 0)).toMatchObject({ forecastMinor: 0, forecastDeviationMinor: -1000000 });
    expect(compareBudget(0, 0, 0, 0)).toMatchObject({ actualDeviationMinor: 0, forecastDeviationMinor: 0 });
  });

  it('returns an immutable approved comparison while a later forecast produces a separate result', () => {
    const approved = compareBudget(1000000, 500000, 0, 900000);
    const revisedForecast = compareBudget(1000000, 500000, 0, 1200000);
    expect(Object.isFrozen(approved)).toBe(true);
    expect(approved.approvedMinor).toBe(1000000);
    expect(approved.forecastDeviationMinor).toBe(-100000);
    expect(revisedForecast.approvedMinor).toBe(1000000);
    expect(revisedForecast.forecastDeviationMinor).toBe(200000);
  });

  it('computes exact positive/negative safe-range deviations without adding committed costs to actual', () => {
    expect(compareBudget(Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER, 0)).toMatchObject({
      actualDeviationMinor: -Number.MAX_SAFE_INTEGER, forecastDeviationMinor: -Number.MAX_SAFE_INTEGER,
      committedPendingMinor: Number.MAX_SAFE_INTEGER,
    });
    expect(compareBudget(0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER))
      .toMatchObject({ actualDeviationMinor: Number.MAX_SAFE_INTEGER, forecastDeviationMinor: Number.MAX_SAFE_INTEGER });
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid money in each budget source %s', amount => {
    expect(() => compareBudget(amount, 0, 0, null)).toThrow(FinanceInputError);
    expect(() => compareBudget(0, amount, 0, null)).toThrow(FinanceInputError);
    expect(() => compareBudget(0, 0, amount, null)).toThrow(FinanceInputError);
    expect(() => compareBudget(0, 0, 0, amount)).toThrow(FinanceInputError);
  });
});

describe('Finance commitment consumption', () => {
  it('leaves only the unconverted commitment alongside the real expense', () => {
    const remaining = consumeCommitment(900000, 0, 600000);
    expect(remaining).toBe(300000);
    expect(compareBudget(900000, 600000, remaining, null)).toMatchObject({
      actualMinor: 600000, committedPendingMinor: 300000, actualDeviationMinor: -300000,
    });
    expect(consumeCommitment(900000, 600000, 300000)).toBe(0);
  });

  it('performs exact BigInt subtraction at the safe integer boundary', () => {
    expect(consumeCommitment(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, 1)).toBe(0);
    expect(consumeCommitment(Number.MAX_SAFE_INTEGER, 0, 1)).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid amount in any consumption source %s', amount => {
    expect(() => consumeCommitment(amount, 0, 1)).toThrow(FinanceInputError);
    expect(() => consumeCommitment(900000, amount, 1)).toThrow(FinanceInputError);
    expect(() => consumeCommitment(900000, 0, amount)).toThrow(FinanceInputError);
  });

  it.each([[900000, 600000, 300001], [900000, 900001, 1], [0, 0, 1], [900000, 900000, 1]])(
    'rejects over-consumption (%s,%s,%s)', (total, consumed, expense) => {
      expect(() => consumeCommitment(total, consumed, expense)).toThrow(FinanceInputError);
    },
  );

  it('rejects a zero new expense instead of treating it as a financial conversion', () => {
    expect(() => consumeCommitment(900000, 0, 0)).toThrow(FinanceInputError);
  });
});
