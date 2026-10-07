import { FinanceInputError } from '../domain/finance.errors';
import { safeMoney, sumMoney } from '../domain/finance-money';
import { compareBudget, consumeCommitment } from '../domain/finance-budget';

export type AgingBucket = 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'OVER_90' | 'UNDATED' | 'REVIEW';
export interface PlanningEvent {
  sourceKey: string;
  origin: 'RECEIVABLE' | 'PAYABLE' | 'COMMITMENT' | 'MANUAL';
  direction: 'IN' | 'OUT';
  amountMinor: number;
  expectedOn: string;
  probabilityBasisPoints: number;
  accountId: string | null;
  reason: string;
}
export interface WeightedPlanningEvent extends PlanningEvent { weightedAmountMinor: number; roundingRemainder: number }

export function planningDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw new FinanceInputError('Fecha pura inválida.');
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new FinanceInputError('La fecha no existe en el calendario.');
  }
  return timestamp / 86_400_000;
}

export function nonnegativePlanningMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new FinanceInputError('El importe PYG debe ser entero seguro no negativo.');
  return value;
}

export function agingBucket(dueOn: string | null, today: string, needsReview = false): AgingBucket {
  const current = planningDate(today);
  if (needsReview) return 'REVIEW';
  if (dueOn === null) return 'UNDATED';
  const days = current - planningDate(dueOn);
  if (days <= 0) return 'CURRENT';
  if (days <= 30) return 'DAYS_1_30';
  if (days <= 60) return 'DAYS_31_60';
  if (days <= 90) return 'DAYS_61_90';
  return 'OVER_90';
}

export function weightedPlanningEvent(event: PlanningEvent): WeightedPlanningEvent {
  nonnegativePlanningMoney(event.amountMinor);
  if (event.amountMinor === 0) throw new FinanceInputError('El evento previsto debe ser positivo.');
  if (!Number.isSafeInteger(event.probabilityBasisPoints) || event.probabilityBasisPoints < 0 || event.probabilityBasisPoints > 10000) {
    throw new FinanceInputError('La probabilidad requiere puntos básicos de 0 a 10000.');
  }
  planningDate(event.expectedOn);
  if (!event.sourceKey || !event.reason.trim()) throw new FinanceInputError('El escenario requiere origen y motivo explícitos.');
  if (event.direction !== 'IN' && event.direction !== 'OUT') throw new FinanceInputError('Dirección de escenario inválida.');
  const numerator = BigInt(event.amountMinor) * BigInt(event.probabilityBasisPoints);
  return { ...event, weightedAmountMinor: safeMoney(numerator / 10000n), roundingRemainder: Number(numerator % 10000n) };
}

export function projectCashScenario(registeredBalanceMinor: number | null, events: readonly PlanningEvent[], from: string, to: string): Readonly<{ basis: 'REGISTERED_CASH_PLUS_SCENARIO'; registeredBalanceMinor: number | null; forecastDeltaMinor: number; projectedBalanceMinor: number | null; events: WeightedPlanningEvent[] }> {
  const first = planningDate(from);
  const last = planningDate(to);
  if (last <= first || last - first > 366 || events.length > 200) throw new FinanceInputError('Horizonte o volumen de escenario inválido.');
  if (registeredBalanceMinor !== null && !Number.isSafeInteger(registeredBalanceMinor)) throw new FinanceInputError('El saldo registrado debe ser un entero seguro PYG.');
  const keys = new Set<string>();
  const weighted = events.map(event => {
    if (keys.has(event.sourceKey)) throw new FinanceInputError('El escenario repite una fuente.');
    keys.add(event.sourceKey);
    const day = planningDate(event.expectedOn);
    if (day < first || day >= last) throw new FinanceInputError('El evento queda fuera del horizonte.');
    return weightedPlanningEvent(event);
  });
  const delta = sumMoney(weighted.map(event => event.direction === 'IN' ? event.weightedAmountMinor : -event.weightedAmountMinor));
  return Object.freeze({
    basis: 'REGISTERED_CASH_PLUS_SCENARIO' as const, registeredBalanceMinor,
    forecastDeltaMinor: delta,
    projectedBalanceMinor: registeredBalanceMinor === null ? null : sumMoney([registeredBalanceMinor, delta]),
    events: weighted,
  });
}

export function pendingCommitment(amountMinor: number, conversions: readonly number[]): number {
  const consumed = sumMoney(conversions.map(nonnegativePlanningMoney));
  if (consumed > nonnegativePlanningMoney(amountMinor)) throw new FinanceInputError('El compromiso tiene consumo superior al importe.');
  return sumMoney([amountMinor, -consumed]);
}

export function requireCommitmentConversion(amountMinor: number, conversions: readonly number[], newExpenseMinor: number): number {
  return consumeCommitment(amountMinor, sumMoney(conversions.map(nonnegativePlanningMoney)), newExpenseMinor);
}

export function comparePlanningBudget(approvedMinor: number, actualSourceAmounts: readonly number[], pendingSourceAmounts: readonly number[], forecastMinor: number | null): ReturnType<typeof compareBudget> {
  return compareBudget(approvedMinor, sumMoney(actualSourceAmounts.map(nonnegativePlanningMoney)), sumMoney(pendingSourceAmounts.map(nonnegativePlanningMoney)), forecastMinor);
}
