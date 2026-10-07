import { agingBucket, comparePlanningBudget, pendingCommitment, planningDate, projectCashScenario, requireCommitmentConversion, weightedPlanningEvent, type PlanningEvent } from './finance-v2-planning.rules';

const event = (values: Partial<PlanningEvent> = {}): PlanningEvent => ({ sourceKey: 'EXPENSE:1', origin: 'PAYABLE', direction: 'OUT', amountMinor: 900000, expectedOn: '2026-10-10', probabilityBasisPoints: 10000, accountId: null, reason: 'Pago previsto', ...values });

describe('Finance V2 planning exact money and dates', () => {
  it('preserves registered balance and computes future amount separately', () => {
    const source = event();
    const projection = projectCashScenario(1000000, [source], '2026-10-05', '2026-11-01');
    expect(projection.registeredBalanceMinor).toBe(1000000);
    expect(projection.forecastDeltaMinor).toBe(-900000);
    expect(projection.projectedBalanceMinor).toBe(100000);
    expect(source).toEqual(event());
  });
  it('keeps unknown baseline null while preserving an explicit forecast delta', () => {
    expect(projectCashScenario(null, [event()], '2026-10-05', '2026-11-01')).toMatchObject({ registeredBalanceMinor: null, forecastDeltaMinor: -900000, projectedBalanceMinor: null });
  });
  it('does not round unsafe decimal inputs and uses exact BigInt weighting', () => {
    expect(weightedPlanningEvent(event({ amountMinor: Number.MAX_SAFE_INTEGER, probabilityBasisPoints: 3333 }))).toMatchObject({ weightedAmountMinor: 3002099511605172, roundingRemainder: 3003 });
    expect(() => weightedPlanningEvent(event({ amountMinor: 1.5 }))).toThrow('PYG');
    expect(() => weightedPlanningEvent(event({ probabilityBasisPoints: 10001 }))).toThrow('probabilidad');
    expect(() => projectCashScenario(0.5, [], '2026-10-05', '2026-11-01')).toThrow('saldo');
  });
  it('rejects unsafe accumulation rather than reporting a rounded projection', () => {
    const max = event({ sourceKey: 'ONE', direction: 'IN', amountMinor: Number.MAX_SAFE_INTEGER });
    const one = event({ sourceKey: 'TWO', direction: 'IN', amountMinor: 1 });
    expect(() => projectCashScenario(0, [max, one], '2026-10-05', '2026-11-01')).toThrow();
    expect(() => projectCashScenario(Number.MAX_SAFE_INTEGER, [one], '2026-10-05', '2026-11-01')).toThrow();
  });
  it('rejects duplicate sources and events outside the half-open horizon', () => {
    expect(() => projectCashScenario(1, [event(), event()], '2026-10-05', '2026-11-01')).toThrow('repite');
    expect(() => projectCashScenario(1, [event({ expectedOn: '2026-11-01' })], '2026-10-05', '2026-11-01')).toThrow('horizonte');
  });
  it('keeps approved target separate from forecast and current commitment consumption', () => {
    expect(comparePlanningBudget(1000000, [600000], [300000], 1200000)).toMatchObject({ approvedMinor: 1000000, actualMinor: 600000, committedPendingMinor: 300000, actualDeviationMinor: -400000, forecastDeviationMinor: 200000 });
    expect(pendingCommitment(900000, [600000])).toBe(300000);
    expect(requireCommitmentConversion(900000, [600000], 300000)).toBe(0);
    expect(() => requireCommitmentConversion(900000, [600000], 300001)).toThrow('superar');
    expect(() => pendingCommitment(900000, [900001])).toThrow('superior');
  });
  it('does not interpret unknown forecast as zero', () => {
    expect(comparePlanningBudget(100, [], [], null)).toMatchObject({ forecastMinor: null, forecastDeviationMinor: null });
  });
  it.each([
    ['2026-10-05', 'CURRENT'], ['2026-10-06', 'CURRENT'], ['2026-10-04', 'DAYS_1_30'],
    ['2026-09-05', 'DAYS_1_30'], ['2026-09-04', 'DAYS_31_60'],
    ['2026-08-06', 'DAYS_31_60'], ['2026-08-05', 'DAYS_61_90'],
    ['2026-07-07', 'DAYS_61_90'], ['2026-07-06', 'OVER_90'],
  ])('places pure date %s in %s without DST duration inference', (date, expected) => {
    expect(agingBucket(date, '2026-10-05')).toBe(expected);
  });
  it('keeps missing date and stale plan explicit', () => {
    expect(agingBucket(null, '2026-10-05')).toBe('UNDATED');
    expect(agingBucket(null, '2026-10-05', true)).toBe('REVIEW');
    expect(planningDate('2026-03-09') - planningDate('2026-03-08')).toBe(1);
    expect(() => planningDate('2026-02-30')).toThrow('calendario');
    expect(() => projectCashScenario(0, [], '2026-10-05', '2027-10-07')).toThrow('Horizonte');
  });
});
