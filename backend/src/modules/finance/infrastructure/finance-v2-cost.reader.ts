import { createHash } from 'node:crypto';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import { requireCostConservation } from '../application/finance-v2-cost.rules';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { financeReportCut, FinanceCostSourceStaleError } from './finance-v2-report.cut';

export interface FinanceProfitabilityCostSource {
  sourceId: string; sourceVersion: number; consumedOn: string; currency: 'PYG';
  amountMinor: number; operational: boolean; basis: 'ACTUAL' | 'ESTIMATE';
  allocations: { resourceId: string | null; amountMinor: number }[];
}
export interface FinanceCostSourceReadResult {
  costSources: FinanceProfitabilityCostSource[]; ownerWorkSources: FinanceProfitabilityCostSource[];
  coverage: { unknownSourceIds: string[]; missingEvidenceSourceIds: string[] }; token: string;
}
interface ExpenseCostRow {
  id: string; amountMinor: bigint; operational: boolean; resourceId: string | null;
  expenseVersion: number; consumedOn: Date; reference: string | null;
  hasPostCutMutation: boolean; hasEvidenceFile: boolean;
}
interface LaborCostRow {
  id: string; revisionId: string; revisionNo: number; kind: 'PRECOMPUTED_LABOR' | 'OWNER_IMPUTED';
  actualExpenseLineId: string | null; estimatedMinor: bigint | null; consumedOn: Date;
}
interface AllocationRow {
  id: string; sourceExpenseLineId: string | null; sourceLaborRevisionId: string | null;
  sourceAmountMinor: bigint; unassignedMinor: bigint; revisionNo: number; ruleRevisionId: string; sourceHash: string;
}
interface AllocationPartRow { allocationId: string; resourceId: string; amountMinor: bigint }

const SOURCE_LIMIT = 5000;
function requireBounded(count: number): void {
  if (count > SOURCE_LIMIT) throw new FinanceConflictError('La consulta supera 5000 fuentes; no se entrega un conjunto truncado.');
}
function dateString(value: Date): string { return value.toISOString().slice(0, 10); }

export async function readFinanceCostSources(tx: FinanceSqlTransaction, input: { businessId: string; from: string; to: string; asOf: string; sourceToken?: string }): Promise<FinanceCostSourceReadResult> {
  const cut = financeReportCut(input.asOf);
  const expense = await tx.query<ExpenseCostRow>('SELECT l.id,l."amountMinor",l.operational,l."resourceId",e.version AS "expenseVersion",e."consumedOn",e.reference,EXISTS(SELECT 1 FROM "FinanceEvidenceFile" f WHERE f."businessId"=e."businessId" AND f."expenseId"=e.id AND f."createdAt"<=$4::timestamp) AS "hasEvidenceFile",EXISTS(SELECT 1 FROM "FinanceAudit" audit WHERE audit."businessId"=e."businessId" AND audit."sourceId"=e.id AND audit."occurredAt">$4::timestamp) AS "hasPostCutMutation" FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" WHERE l."businessId"=$1 AND e."consumedOn">=$2::date AND e."consumedOn"<$3::date AND e."createdAt"<=$4::timestamp ORDER BY e."consumedOn",l.id LIMIT 5001', [input.businessId, input.from, input.to, cut]);
  if (expense.some(row => row.hasPostCutMutation !== false)) throw new FinanceCostSourceStaleError();
  const labor = await tx.query<LaborCostRow>('SELECT DISTINCT ON (l.id) l.id,l.kind,l."consumedOn",r.id AS "revisionId",r."revisionNo",r."actualExpenseLineId",r."estimatedMinor" FROM "FinanceLaborCost" l JOIN "FinanceLaborCostRevision" r ON r."laborId"=l.id AND r."businessId"=l."businessId" WHERE l."businessId"=$1 AND l."consumedOn">=$2::date AND l."consumedOn"<$3::date AND l."createdAt"<=$4::timestamp AND r."createdAt"<=$4::timestamp ORDER BY l.id,r."revisionNo" DESC LIMIT 5001', [input.businessId, input.from, input.to, cut]);
  requireBounded(expense.length + labor.length);
  const allocations = await tx.query<AllocationRow>('SELECT DISTINCT ON (a."sourceExpenseLineId",a."sourceLaborRevisionId") a.id,a."sourceExpenseLineId",a."sourceLaborRevisionId",a."sourceAmountMinor",a."unassignedMinor",a."revisionNo",a."ruleRevisionId",a."sourceHash" FROM "FinanceCostAllocation" a JOIN "FinanceAllocationRuleRevision" r ON r.id=a."ruleRevisionId" AND r."businessId"=a."businessId" WHERE a."businessId"=$1 AND (a."sourceExpenseLineId"=ANY($2::text[]) OR a."sourceLaborRevisionId"=ANY($3::text[])) AND a."createdAt"<=$4::timestamp AND r."createdAt"<=$4::timestamp ORDER BY a."sourceExpenseLineId",a."sourceLaborRevisionId",a."revisionNo" DESC LIMIT 5001', [input.businessId, expense.map(row => row.id), labor.filter(row => row.actualExpenseLineId === null).map(row => row.revisionId), cut]);
  requireBounded(expense.length + labor.length + allocations.length);
  const parts = allocations.length ? await tx.query<AllocationPartRow>('SELECT "allocationId","resourceId","amountMinor" FROM "FinanceCostAllocationPart" WHERE "businessId"=$1 AND "allocationId"=ANY($2::text[]) AND "createdAt"<=$3::timestamp ORDER BY "allocationId","resourceId" LIMIT 5001', [input.businessId, allocations.map(row => row.id), cut]) : [];
  requireBounded(expense.length + labor.length + allocations.length + parts.length);
  const costSources: FinanceProfitabilityCostSource[] = [];
  const ownerWorkSources: FinanceProfitabilityCostSource[] = [];
  const coverage = { unknownSourceIds: [] as string[], missingEvidenceSourceIds: [] as string[] };
  for (const row of expense) {
    const sourceId = `EXPENSE_LINE:${row.id}`;
    const amountMinor = safeMoney(row.amountMinor);
    const allocation = allocations.find(candidate => candidate.sourceExpenseLineId === row.id);
    costSources.push({ sourceId, sourceVersion: row.expenseVersion, consumedOn: dateString(row.consumedOn), currency: 'PYG', amountMinor, operational: row.operational, basis: 'ACTUAL', allocations: costDestinations(amountMinor, row.resourceId, allocation, parts) });
    if ((row.reference === null || !row.reference.trim()) && !row.hasEvidenceFile) coverage.missingEvidenceSourceIds.push(sourceId);
  }
  collectLaborSources(labor,expense,allocations,parts,{costSources,ownerWorkSources,coverage});
  const ids = costSources.map(row => row.sourceId);
  if (new Set(ids).size !== ids.length) throw new FinanceInputError('La lectura repite un costo fuente.');
  const allocationRefs = allocations.map(row => ({ id: row.id, revisionNo: row.revisionNo, ruleRevisionId: row.ruleRevisionId, sourceHash: row.sourceHash }));
  const laborRefs = labor.map(row => ({ id: row.id, revisionId: row.revisionId, revisionNo: row.revisionNo, actualExpenseLineId: row.actualExpenseLineId }));
  const token = createHash('sha256').update(JSON.stringify({ businessId: input.businessId, from: input.from, to: input.to, costSources, ownerWorkSources, coverage, allocationRefs, laborRefs })).digest('hex');
  if (input.sourceToken !== undefined && input.sourceToken !== token) throw new FinanceConflictError('La consulta de costos cambió. Actualiza antes de continuar.');
  return { costSources, ownerWorkSources, coverage, token };
}

function collectLaborSources(labor:readonly LaborCostRow[],expense:readonly ExpenseCostRow[],allocations:readonly AllocationRow[],parts:readonly AllocationPartRow[],result:Pick<FinanceCostSourceReadResult,'costSources'|'ownerWorkSources'|'coverage'>):void{
  const{costSources,ownerWorkSources,coverage}=result;
  for (const row of labor) {
    if (row.actualExpenseLineId !== null) {
      if (!expense.some(source => source.id === row.actualExpenseLineId && source.operational)) throw new FinanceConflictError('La fuente real laboral no pertenece al ámbito operativo declarado.');
      continue; // canonical ExpenseLine above, never a second actual cost
    }
    const sourceId = `${row.kind === 'OWNER_IMPUTED' ? 'OWNER_IMPUTED' : 'LABOR_ESTIMATE'}:${row.revisionId}`;
    if (row.estimatedMinor === null) { coverage.unknownSourceIds.push(sourceId); continue; }
    const amountMinor = safeMoney(row.estimatedMinor);
    const allocation = allocations.find(candidate => candidate.sourceLaborRevisionId === row.revisionId);
    const source: FinanceProfitabilityCostSource = { sourceId, sourceVersion: row.revisionNo, consumedOn: dateString(row.consumedOn), currency: 'PYG', amountMinor, operational: true, basis: 'ESTIMATE', allocations: costDestinations(amountMinor, null, allocation, parts) };
    (row.kind === 'OWNER_IMPUTED' ? ownerWorkSources : costSources).push(source);
  }
}

function costDestinations(amountMinor: number, resourceId: string | null, allocation: AllocationRow | undefined, parts: readonly AllocationPartRow[]): { resourceId: string | null; amountMinor: number }[] {
  if (!allocation) return [{ resourceId, amountMinor }];
  if (resourceId !== null || safeMoney(allocation.sourceAmountMinor) !== amountMinor) throw new FinanceConflictError('La asignación no corresponde al costo fuente vigente.');
  const destinations = parts.filter(row => row.allocationId === allocation.id).map(row => ({ resourceId: row.resourceId, amountMinor: safeMoney(row.amountMinor) }));
  const unassignedMinor = safeMoney(allocation.unassignedMinor);
  requireCostConservation(amountMinor, destinations.map(row => row.amountMinor), unassignedMinor);
  return [...destinations, { resourceId: null, amountMinor: unassignedMinor }];
}
