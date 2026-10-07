import { allocateCost, selectLaborCost, type AllocationRule } from './finance-allocation';
import { FinanceInputError } from './finance.errors';

const RULE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RESOURCE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RESOURCE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESOURCE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function rule(percentages: number[]): AllocationRule {
  return {
    id: RULE_ID, version: 3,
    parts: percentages.map((basisPoints, index) => ({ resourceId: [RESOURCE_A, RESOURCE_B, RESOURCE_C][index], basisPoints })),
  };
}

function randomGenerator(seed: number): () => number {
  let state = seed;
  return () => {
    state = state * 48271 % 2147483647;
    return state;
  };
}

describe('Finance versioned percentage allocation', () => {
  it.each([
    [1000000, [6000, 3000, 1000], [600000, 300000, 100000]],
    [3000000, [7000, 2000, 1000], [2100000, 600000, 300000]],
    [100001, [6000, 3000, 1000], [60001, 30000, 10000]],
    [100001, [3333, 3333, 3334], [33330, 33330, 33341]],
  ])('conserves the approved %s PYG source using explicit 0.01%% percentage precision', (amountMinor, percentages, amounts) => {
    const result = allocateCost(amountMinor, rule(percentages));
    expect(result).toEqual({
      allocations: amounts.map((value, index) => ({ resourceId: [RESOURCE_A, RESOURCE_B, RESOURCE_C][index], amountMinor: value })),
      unassignedMinor: 0, ruleId: RULE_ID, ruleVersion: 3,
    });
  });

  it('keeps the partial percentage remainder visibly unassigned instead of redistributing it', () => {
    expect(allocateCost(100001, rule([6000]))).toMatchObject({
      allocations: [{ resourceId: RESOURCE_A, amountMinor: 60000 }], unassignedMinor: 40001,
    });
    expect(allocateCost(1, rule([5000]))).toMatchObject({
      allocations: [{ resourceId: RESOURCE_A, amountMinor: 0 }], unassignedMinor: 1,
    });
  });

  it.each([
    [2, [6000, 4000], [1, 1], 0],
    [17, [6000, 3000, 1000], [10, 5, 2], 0],
    [7, [1000, 4000, 3000], [0, 3, 2], 2],
  ])('assigns %s PYG by the largest fractional remainder before Resource ID', (amount, percentages, amounts, unassignedMinor) => {
    const source = rule(percentages);
    const expected = {
      allocations: amounts.map((amountMinor, index) => ({ resourceId: [RESOURCE_A, RESOURCE_B, RESOURCE_C][index], amountMinor })),
      unassignedMinor, ruleId: RULE_ID, ruleVersion: 3,
    };
    expect(allocateCost(amount, source)).toEqual(expected);
    expect(allocateCost(amount, { ...source, parts: [...source.parts].reverse() })).toEqual(expected);
  });

  it('allows explicit zero percentages and an empty allocation rule as wholly unassigned', () => {
    expect(allocateCost(450000, rule([]))).toEqual({ allocations: [], unassignedMinor: 450000, ruleId: RULE_ID, ruleVersion: 3 });
    expect(allocateCost(450000, rule([0, 0]))).toMatchObject({
      allocations: [{ resourceId: RESOURCE_A, amountMinor: 0 }, { resourceId: RESOURCE_B, amountMinor: 0 }], unassignedMinor: 450000,
    });
  });

  it('breaks equal largest remainders by canonical lexicographic Resource ID independently of input order', () => {
    const source = rule([5000, 5000]);
    const reversed = { ...source, parts: [...source.parts].reverse() };
    expect(allocateCost(1, source)).toEqual(allocateCost(1, reversed));
    expect(allocateCost(1, reversed).allocations).toEqual([
      { resourceId: RESOURCE_A, amountMinor: 1 }, { resourceId: RESOURCE_B, amountMinor: 0 },
    ]);
  });

  it('preserves the supplied rule ID/version and never mutates a frozen historical rule', () => {
    const source = Object.freeze({
      id: RULE_ID.toUpperCase(), version: 12,
      parts: Object.freeze([
        Object.freeze({ resourceId: RESOURCE_B.toUpperCase(), basisPoints: 3000 }),
        Object.freeze({ resourceId: RESOURCE_A.toUpperCase(), basisPoints: 6000 }),
      ]),
    });
    const before = JSON.stringify(source);
    const result = allocateCost(100001, source);
    expect(result).toMatchObject({ ruleId: RULE_ID.toUpperCase(), ruleVersion: 12, unassignedMinor: 10001 });
    expect(result.allocations.map(item => item.resourceId)).toEqual([RESOURCE_A, RESOURCE_B]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('handles maximum safe PYG using exact BigInt products and remainders', () => {
    const source = rule([10000]);
    expect(allocateCost(Number.MAX_SAFE_INTEGER, source).allocations[0].amountMinor).toBe(Number.MAX_SAFE_INTEGER);
    const mixed = allocateCost(Number.MAX_SAFE_INTEGER, rule([6000, 3000, 1000]));
    expect(mixed.allocations.reduce((total, part) => total + BigInt(part.amountMinor), 0n)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it.each([0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid source money %s', amount => {
    expect(() => allocateCost(amount, rule([10000]))).toThrow(FinanceInputError);
  });

  it.each([-1, 10001, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid percentage %s', percentage => {
    expect(() => allocateCost(100001, rule([percentage]))).toThrow(FinanceInputError);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid rule version %s', version => {
    expect(() => allocateCost(100001, { ...rule([10000]), version })).toThrow(FinanceInputError);
  });

  it('rejects over-allocation, duplicate canonical resource IDs and invalid IDs', () => {
    expect(() => allocateCost(100001, rule([6000, 5000]))).toThrow(FinanceInputError);
    expect(() => allocateCost(100001, { ...rule([]), parts: [{ resourceId: RESOURCE_A, basisPoints: 5000 }, { resourceId: RESOURCE_A.toUpperCase(), basisPoints: 5000 }] })).toThrow(FinanceInputError);
    expect(() => allocateCost(100001, { ...rule([10000]), id: 'invalid' })).toThrow(FinanceInputError);
    expect(() => allocateCost(100001, { ...rule([]), parts: [{ resourceId: 'invalid', basisPoints: 10000 }] })).toThrow(FinanceInputError);
  });

  it('rejects malformed rules and destinations without accidental TypeErrors', () => {
    expect(() => allocateCost(100001, null as unknown as AllocationRule)).toThrow(FinanceInputError);
    expect(() => allocateCost(100001, { ...rule([]), parts: null } as unknown as AllocationRule)).toThrow(FinanceInputError);
    expect(() => allocateCost(100001, { ...rule([]), parts: [null] } as unknown as AllocationRule)).toThrow(FinanceInputError);
  });

  it('conserves arbitrary synthetic sources and target percentages deterministically across 500 seeded cases', () => {
    const next = randomGenerator(20261005);
    for (let example = 0; example < 500; example += 1) {
      const amount = BigInt(next()) * BigInt(next()) % BigInt(Number.MAX_SAFE_INTEGER) + 1n;
      const count = next() % 12;
      let remainingPercentage = 10000;
      const parts = Array.from({ length: count }, (_, index) => {
        const basisPoints = next() % (remainingPercentage + 1);
        remainingPercentage -= basisPoints;
        return { resourceId: `${index.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`, basisPoints };
      });
      const source = { id: RULE_ID, version: example + 1, parts };
      const result = allocateCost(Number(amount), source);
      const assigned = result.allocations.reduce((total, part) => total + BigInt(part.amountMinor), 0n);
      expect(assigned + BigInt(result.unassignedMinor)).toBe(amount);
      expect(assigned).toBe(amount * BigInt(10000 - remainingPercentage) / 10000n);
      expect(result).toEqual(allocateCost(Number(amount), { ...source, parts: [...parts].reverse() }));
      for (const part of result.allocations) {
        const percentage = parts.find(input => input.resourceId === part.resourceId)?.basisPoints ?? 0;
        const floor = amount * BigInt(percentage) / 10000n;
        expect([floor, floor + 1n]).toContain(BigInt(part.amountMinor));
        expect(Number.isSafeInteger(part.amountMinor)).toBe(true);
      }
    }
  });
});

describe('Finance externally calculated labor cost selection', () => {
  it.each([
    [3000000, 2800000, { amountMinor: 3000000, basis: 'ACTUAL' }],
    [0, 3000000, { amountMinor: 0, basis: 'ACTUAL' }],
    [null, 3000000, { amountMinor: 3000000, basis: 'ESTIMATE' }],
    [null, 0, { amountMinor: 0, basis: 'ESTIMATE' }],
    [null, null, { amountMinor: null, basis: 'UNKNOWN' }],
  ])('selects actual before estimate without treating unknown as zero', (actual, estimate, result) => {
    expect(selectLaborCost(actual, estimate)).toEqual(result);
  });

  it('never sums actual and estimated costs even when both reach the safe integer boundary', () => {
    expect(selectLaborCost(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toEqual({ amountMinor: Number.MAX_SAFE_INTEGER, basis: 'ACTUAL' });
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid actual or estimate %s', amount => {
    expect(() => selectLaborCost(amount, null)).toThrow(FinanceInputError);
    expect(() => selectLaborCost(null, amount)).toThrow(FinanceInputError);
    expect(() => selectLaborCost(3000000, amount)).toThrow(FinanceInputError);
  });
});
