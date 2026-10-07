import { allocateCost, selectLaborCost, type AllocationRule, type CostAllocationResult, type LaborCostSelection } from '../domain/finance-allocation';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
import { requireExactVersion } from './finance-v2-policy.rules';
import { planningDate } from './finance-v2-planning.rules';

export interface CommonCostSource {
  id: string; businessId: string; version: number; amountMinor: number | null;
  consumedOn: string; resourceId: string | null; bookingId: string | null; operational: boolean;
}
export interface ScopedAllocationRule extends AllocationRule {
  businessId: string; validFrom: string; validTo: string | null;
}

export function applyCommonCostRule(source: CommonCostSource, rule: ScopedAllocationRule, businessId: string, expectedSourceVersion: number, allowedResourceIds: readonly string[]): CostAllocationResult {
  if (source.businessId !== businessId || rule.businessId !== businessId) throw new FinanceNotFoundError('Fuente o regla no disponible.');
  requireExactVersion(source.version, expectedSourceVersion);
  if (!source.operational || source.resourceId !== null || source.bookingId !== null) {
    throw new FinanceConflictError('La regla común requiere una fuente operativa sin asignación directa.');
  }
  requireAllocationValidity(source.consumedOn, rule);
  const allowed = new Set(allowedResourceIds);
  if (rule.parts.some(part => !allowed.has(part.resourceId))) throw new FinanceNotFoundError('Recurso no disponible.');
  if (source.amountMinor === null) throw new FinanceConflictError('El costo es desconocido.');
  return allocateCost(source.amountMinor, rule);
}
function requireAllocationValidity(consumedOn: string, rule: ScopedAllocationRule): void {
  const day = planningDate(consumedOn);
  if (day < planningDate(rule.validFrom) || (rule.validTo !== null && day >= planningDate(rule.validTo))) throw new FinanceConflictError('La fuente no pertenece a la vigencia de la regla.');
}

export function selectLaborSource(actual: { expenseLineId: string; amountMinor: number } | null, estimated: { revisionId: string; amountMinor: number } | null): LaborCostSelection & { sourceKey: string | null } {
  const selected = selectLaborCost(actual?.amountMinor ?? null, estimated?.amountMinor ?? null);
  if (selected.basis === 'ACTUAL') return { ...selected, sourceKey: `EXPENSE_LINE:${actual!.expenseLineId}` };
  if (selected.basis === 'ESTIMATE') return { ...selected, sourceKey: `LABOR_ESTIMATE:${estimated!.revisionId}` };
  return { ...selected, sourceKey: null };
}

export function requireCostConservation(amountMinor: number, destinations: readonly number[], unassignedMinor: number): void {
  if (destinations.some(amount => !Number.isSafeInteger(amount) || amount < 0) || !Number.isSafeInteger(unassignedMinor) || unassignedMinor < 0) {
    throw new FinanceInputError('Los destinos PYG deben ser enteros seguros no negativos.');
  }
  if (sumMoney([...destinations, unassignedMinor]) !== amountMinor) throw new FinanceConflictError('La distribución no conserva el costo fuente.');
}
