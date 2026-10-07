import { FinanceInputError } from './finance.errors';
import { safeMoney } from './finance-money';
import { parseFinanceUuid } from './finance-validation';

export interface AllocationRule {
  readonly id: string;
  readonly version: number;
  readonly parts: readonly { readonly resourceId: string; readonly basisPoints: number }[];
}

export interface CostAllocationResult {
  readonly allocations: readonly { readonly resourceId: string; readonly amountMinor: number }[];
  readonly unassignedMinor: number;
  readonly ruleId: string;
  readonly ruleVersion: number;
}

export interface LaborCostSelection {
  readonly amountMinor: number | null;
  readonly basis: 'ACTUAL' | 'ESTIMATE' | 'UNKNOWN';
}

interface CalculatedPart {
  resourceId: string;
  amountMinor: bigint;
  remainder: bigint;
}

const WHOLE_PERCENT = 10000n;

function nonnegativeMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FinanceInputError('El costo PYG debe ser un entero seguro no negativo.');
  }
  return value;
}

function compareResourceIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateRule(rule: AllocationRule): { resourceId: string; basisPoints: number }[] {
  if (!rule || !Array.isArray(rule.parts)) throw new FinanceInputError('Se requiere una regla con destinos explícitos.');
  parseFinanceUuid(rule.id);
  if (!Number.isSafeInteger(rule.version) || rule.version < 1) {
    throw new FinanceInputError('La versión de la regla debe ser un entero seguro positivo.');
  }
  const seen = new Set<string>();
  return rule.parts.map((part: AllocationRule['parts'][number]) => {
    if (!part) throw new FinanceInputError('Se requiere un destino de asignación válido.');
    const resourceId = parseFinanceUuid(part.resourceId);
    if (seen.has(resourceId)) throw new FinanceInputError('Una regla no puede repetir un recurso.');
    if (!Number.isSafeInteger(part.basisPoints) || part.basisPoints < 0 || part.basisPoints > 10000) {
      throw new FinanceInputError('El porcentaje requiere puntos básicos enteros de 0 a 10000.');
    }
    seen.add(resourceId);
    return { resourceId, basisPoints: part.basisPoints };
  }).sort((left, right) => compareResourceIds(left.resourceId, right.resourceId));
}

function distributeRemainder(parts: CalculatedPart[], target: bigint): void {
  const allocated = parts.reduce((total, part) => total + part.amountMinor, 0n);
  const remaining = safeMoney(target - allocated);
  const ranked = [...parts].sort((left, right) => {
    if (left.remainder > right.remainder) return -1;
    if (left.remainder < right.remainder) return 1;
    return compareResourceIds(left.resourceId, right.resourceId);
  });
  for (let index = 0; index < remaining; index += 1) ranked[index].amountMinor += 1n;
}

export function allocateCost(amountMinor: number, rule: AllocationRule): CostAllocationResult {
  nonnegativeMoney(amountMinor);
  if (amountMinor === 0) throw new FinanceInputError('El costo a distribuir debe ser positivo.');
  const input = validateRule(rule);
  const percentage = input.reduce((total, part) => total + BigInt(part.basisPoints), 0n);
  if (percentage > WHOLE_PERCENT) throw new FinanceInputError('Los porcentajes no pueden superar el 100%.');
  const amount = BigInt(amountMinor);
  const target = amount * percentage / WHOLE_PERCENT;
  const parts: CalculatedPart[] = input.map(part => {
    const numerator = amount * BigInt(part.basisPoints);
    return { resourceId: part.resourceId, amountMinor: numerator / WHOLE_PERCENT, remainder: numerator % WHOLE_PERCENT };
  });
  distributeRemainder(parts, target);
  return {
    allocations: parts.map(part => ({ resourceId: part.resourceId, amountMinor: safeMoney(part.amountMinor) })),
    unassignedMinor: safeMoney(amount - target), ruleId: rule.id, ruleVersion: rule.version,
  };
}

export function selectLaborCost(actual: number | null, estimated: number | null): LaborCostSelection {
  if (actual !== null) nonnegativeMoney(actual);
  if (estimated !== null) nonnegativeMoney(estimated);
  if (actual !== null) return { amountMinor: actual, basis: 'ACTUAL' };
  if (estimated !== null) return { amountMinor: estimated, basis: 'ESTIMATE' };
  return { amountMinor: null, basis: 'UNKNOWN' };
}
