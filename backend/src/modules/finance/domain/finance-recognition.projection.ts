import { recognitionDate, recognitionMoney, recognitionRequire, recognitionSafe, recognitionVersion } from './finance-recognition.support';
import type { RecognitionCostSource, RecognitionCoverage, RecognitionProjectionUnit, RecognitionTerminalEntry, ResourceProfitability } from './finance-recognition.types';

export function projectResourceProfitability(input: { from: string; to: string; units: readonly RecognitionProjectionUnit[]; terminalEntries: readonly RecognitionTerminalEntry[]; costSources: readonly RecognitionCostSource[]; resourceIds: readonly string[]; coverage: RecognitionCoverage }): { rows: ResourceProfitability[]; totals: ResourceProfitability; coverage: RecognitionCoverage } {
  recognitionDate(input.from); recognitionDate(input.to);
  recognitionRequire(input.from < input.to, 'INVALID_PERIOD', 'El período [from,to) debe ser positivo.');
  const values = new Map<string | null, { service: bigint; terminal: bigint; cost: bigint }>();
  const known = new Set(input.resourceIds);
  recognitionRequire(known.size === input.resourceIds.length, 'DUPLICATE_RESOURCE', 'El inventario no puede duplicar recursos.');
  for (const resourceId of [...input.resourceIds, null]) values.set(resourceId, { service: 0n, terminal: 0n, cost: 0n });
  const bucket = (resourceId: string | null) => {
    recognitionRequire(resourceId === null || known.has(resourceId), 'RESOURCE_COVERAGE_INCOMPLETE', 'El inventario debe conservar recursos históricos y archivados.');
    return values.get(resourceId)!;
  };
  accumulateService(input, bucket);
  const { complete, pendingByReason } = accumulateTerminal(input, bucket);
  accumulateCosts(input, bucket);
  const make = (resourceId: string | null, value: { service: bigint; terminal: bigint; cost: bigint }): ResourceProfitability => {
    const income = value.service + value.terminal; const result = income - value.cost;
    return { resourceId, serviceRevenueMinor: recognitionSafe(value.service), terminalRevenueMinor: recognitionSafe(value.terminal), costMinor: recognitionSafe(value.cost), resultMinor: recognitionSafe(result), marginBasisPoints: complete && income > 0n ? recognitionSafe(result * 10000n / income) : null };
  };
  const rows = [...values].map(([resourceId, value]) => make(resourceId, value));
  const total = [...values.values()].reduce((sum, value) => ({ service: sum.service + value.service, terminal: sum.terminal + value.terminal, cost: sum.cost + value.cost }), { service: 0n, terminal: 0n, cost: 0n });
  return { rows, totals: make(null, total), coverage: { complete, pendingByReason } };
}

type ProjectionInput = Parameters<typeof projectResourceProfitability>[0];
type ProfitBucket = { service: bigint; terminal: bigint; cost: bigint };
type BucketReader = (resourceId: string | null) => ProfitBucket;
function accumulateService(input: ProjectionInput, bucket: BucketReader): void {
  const seenNights = new Set<string>();
  for (const unit of input.units) {
    recognitionDate(unit.localNight); recognitionMoney(unit.amountMinor); recognitionVersion(unit.certificateVersion, 1);
    const key = `${unit.bookingId}:${unit.localNight}`;
    recognitionRequire(!seenNights.has(key), 'DUPLICATE_SERVICE_UNIT', 'Sólo la versión efectiva de cada noche puede integrar el resultado.');
    seenNights.add(key);
    if (input.from <= unit.localNight && unit.localNight < input.to) bucket(unit.resourceId).service += BigInt(unit.amountMinor);
  }
}
function accumulateTerminal(input: ProjectionInput, bucket: BucketReader): RecognitionCoverage {
  const pendingByReason = { ...input.coverage.pendingByReason };
  let complete = input.coverage.complete;
  const seenTerminal = new Set<string>();
  for (const entry of input.terminalEntries) {
    recognitionDate(entry.recognitionOn); recognitionMoney(entry.amountMinor);
    recognitionRequire(!seenTerminal.has(entry.bookingId), 'DUPLICATE_TERMINAL_RECOGNITION', 'Sólo la confirmación terminal efectiva de una reserva puede integrar el resultado.');
    seenTerminal.add(entry.bookingId);
    if (input.from <= entry.recognitionOn && entry.recognitionOn < input.to) {
      if (entry.stale) { complete = false; pendingByReason.TERMINAL_SOURCE_STALE = (pendingByReason.TERMINAL_SOURCE_STALE ?? 0) + 1; }
      else bucket(entry.resourceId).terminal += BigInt(entry.amountMinor);
    }
  }
  return { complete, pendingByReason };
}
function accumulateCosts(input: ProjectionInput, bucket: BucketReader): void {
  const seenCosts = new Set<string>();
  for (const source of input.costSources) {
    recognitionDate(source.consumedOn); recognitionMoney(source.amountMinor); recognitionVersion(source.sourceVersion, 1);
    recognitionRequire(source.currency === 'PYG' && ['ACTUAL', 'ESTIMATE'].includes(source.basis), 'INVALID_COST_SOURCE', 'El costo debe tener una única base explícita y PYG.');
    recognitionRequire(!seenCosts.has(source.sourceId), 'DUPLICATE_COST_SOURCE', 'Una fuente se cuenta una vez; actual sustituye a estimado.');
    seenCosts.add(source.sourceId);
    const destinations = new Set<string | null>();
    let assigned = 0n;
    for (const part of source.allocations) {
      recognitionMoney(part.amountMinor);
      recognitionRequire(!destinations.has(part.resourceId), 'DUPLICATE_COST_DESTINATION', 'El reparto no repite destinos ni sin asignar.');
      destinations.add(part.resourceId); assigned += BigInt(part.amountMinor);
      const target = bucket(part.resourceId);
      if (source.operational && input.from <= source.consumedOn && source.consumedOn < input.to) target.cost += BigInt(part.amountMinor);
    }
    recognitionRequire(assigned === BigInt(source.amountMinor), 'COST_CONSERVATION_FAILED', 'Destinos más sin asignar deben reproducir la fuente exacta.');
  }
}
