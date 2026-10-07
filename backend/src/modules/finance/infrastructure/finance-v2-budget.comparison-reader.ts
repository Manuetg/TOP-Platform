import { createHash } from 'node:crypto';
import type { FinanceBudgetComparison, FinanceBudgetDto, FinanceCostReport, FinanceCommitmentDto, FinanceBudgetForecastBasis } from '../domain/finance-v2.types';
import { sumMoney } from '../domain/finance-money';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';

interface BudgetDimension {
  categoryId: string | null; resourceId: string | null; approvedMinor: number | null;
  actual: number[]; pending: number[];
}
type DimensionReader = (categoryId: string | null, resourceId: string | null) => BudgetDimension;
interface BudgetComparisonInput {
  budget: FinanceBudgetDto | null; costs: FinanceCostReport; commitments: readonly FinanceCommitmentDto[];
  forecastBasis?: FinanceBudgetForecastBasis | null;
}

/** Reads only known operating sources from the caller's authorized, single transaction/cut. */
export function compareFinanceV2Budget(input: BudgetComparisonInput): FinanceBudgetComparison {
  const { budget, costs } = input;
  if (!budget) throw new FinanceNotFoundError('No hay presupuesto para ese período.');
  const forecastBasis = input.forecastBasis ?? null;
  validateComparison(input, budget, forecastBasis);
  const approved = budget.revisions.find(revision => revision.id === budget.approvedRevisionId);
  const dimensions = new Map<string, BudgetDimension>();
  const dimension: DimensionReader = (categoryId, resourceId) => readDimension(dimensions, categoryId, resourceId);
  for (const line of approved?.lines ?? []) dimension(line.categoryId, line.resourceId).approvedMinor = line.approvedMinor;
  collectActualCosts(dimension, costs);
  const pending = input.commitments.filter(commitment => isPendingSource(commitment, budget.periodMonth));
  for (const commitment of pending) dimension(commitment.categoryId, commitment.resourceId).pending.push(commitment.pendingMinor);
  const lines = [...dimensions.values()].map(row => comparisonLine(row, forecastBasis));
  const token = digest({ costToken: costs.token, budget, commitments: input.commitments });
  return {
    businessId: costs.businessId, currency: 'PYG', timeZone: costs.timeZone, from: costs.from, to: costs.to,
    asOf: costs.asOf, token, sourceLimit: 5000, budgetId: budget.id, budgetVersion: budget.version,
    approvedRevisionId: budget.approvedRevisionId, lines, forecastBasis,
    scenarioToken: forecastBasis === null ? null : digest({ sourceToken: token, forecastBasis, asOf: costs.asOf }),
    estimatedSelectedMinor: nonNegativeSum([costs.totals.estimatedSelectedMinor]),
    ownerImputedMinor: nonNegativeSum([costs.totals.ownerImputedMinor]),
    coverage: {
      scope: 'KNOWN_OPERATING_SOURCES_ONLY', sourceLimit: 5000, costSourceToken: costs.token,
      costSourceCount: costs.rows.length, pendingCommitmentSourceCount: pending.filter(row => row.pendingMinor > 0).length,
      unknownCostSourceIds: [...costs.coverage.unknownSourceIds], missingEvidenceSourceIds: [...costs.coverage.missingEvidenceSourceIds],
      unsupportedReasons: [...costs.coverage.unsupportedReasons],
    },
  };
}

function validateComparison(input: BudgetComparisonInput, budget: FinanceBudgetDto, forecastBasis: FinanceBudgetForecastBasis | null): void {
  if (forecastBasis !== null && forecastBasis !== 'ACTUAL_PLUS_PENDING_COMMITMENTS') throw new FinanceInputError('Base de previsión de costos inválida.');
  if (budget.businessId !== input.costs.businessId || input.commitments.some(row => row.businessId !== input.costs.businessId)) throw new FinanceConflictError('Las fuentes de comparación no pertenecen al mismo negocio.');
  if (input.costs.from !== `${budget.periodMonth}-01` || input.costs.to !== nextMonth(budget.periodMonth)) throw new FinanceConflictError('Las fuentes no corresponden al mes presupuestario completo.');
  if (input.costs.rows.length + input.commitments.length > 5000) throw new FinanceConflictError('La comparación supera 5000 fuentes; no se trunca.');
}

function nextMonth(periodMonth: string): string {
  const date = new Date(`${periodMonth}-01T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new FinanceInputError('Mes presupuestario inválido.');
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function readDimension(dimensions: Map<string, BudgetDimension>, categoryId: string | null, resourceId: string | null): BudgetDimension {
  const key = `${categoryId ?? ''}:${resourceId ?? ''}`;
  const existing = dimensions.get(key);
  if (existing) return existing;
  if (dimensions.size >= 5000) throw new FinanceConflictError('La comparación supera 5000 dimensiones; no se trunca.');
  const value: BudgetDimension = { categoryId, resourceId, approvedMinor: null, actual: [], pending: [] };
  dimensions.set(key, value);
  return value;
}

function collectActualCosts(dimension: DimensionReader, costs: FinanceCostReport): void {
  for (const row of costs.rows) {
    if (row.basis !== 'ACTUAL') continue;
    for (const part of row.destinations) dimension(row.categoryId, part.resourceId).actual.push(part.amountMinor);
    if (row.unassignedMinor !== null) dimension(row.categoryId, null).actual.push(row.unassignedMinor);
  }
}

function isPendingSource(commitment: FinanceCommitmentDto, periodMonth: string): boolean {
  return commitment.state === 'ACTIVE' && commitment.operational && commitment.expectedConsumptionOn.startsWith(`${periodMonth}-`);
}

function comparisonLine(row: BudgetDimension, forecastBasis: FinanceBudgetForecastBasis | null): FinanceBudgetComparison['lines'][number] {
  const actualMinor = nonNegativeSum(row.actual);
  const committedPendingMinor = nonNegativeSum(row.pending);
  const forecastMinor = forecastBasis === null ? null : nonNegativeSum([actualMinor, committedPendingMinor]);
  return {
    resourceId: row.resourceId, categoryId: row.categoryId, approvedMinor: row.approvedMinor, actualMinor, committedPendingMinor, forecastMinor,
    actualDeviationMinor: deviation(actualMinor, row.approvedMinor),
    forecastDeviationMinor: forecastMinor === null ? null : deviation(forecastMinor, row.approvedMinor),
  };
}

function deviation(amountMinor: number, approvedMinor: number | null): number | null {
  return approvedMinor === null ? null : sumMoney([amountMinor, -approvedMinor]);
}

function nonNegativeSum(values: number[]): number {
  if (values.some(value => value < 0)) throw new FinanceInputError('Las fuentes de costo deben ser importes no negativos.');
  return sumMoney(values);
}

function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
