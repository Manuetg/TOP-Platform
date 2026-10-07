import { createHash } from 'node:crypto';
import type { FinanceCostReport, FinanceCostRow, FinanceV2ReportQuery } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { safeMoney, sumMoney } from '../domain/finance-money';
import { planningDate } from '../application/finance-v2-planning.rules';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { readFinanceCostSources, type FinanceProfitabilityCostSource } from './finance-v2-cost.reader';
import { sqlDate } from './finance-v2-draft.sql-store';
import { financeReportCut, FinanceCostSourceStaleError } from './finance-v2-report.cut';

interface ExpenseDetail { id: string; expenseId: string; bookingId: string | null; resourceId: string | null; categoryId: string; consumedOn: Date; amountMinor: bigint; operational: boolean; version: number }
interface LaborDetail { id: string; revisionId: string; revisionNo: number; kind: 'OWNER_IMPUTED' | 'PRECOMPUTED_LABOR'; actualExpenseLineId: string | null; estimatedMinor: bigint | null; consumedOn: Date }
interface AllocationDetail { id: string; revisionNo: number; sourceExpenseLineId: string | null; sourceLaborRevisionId: string | null; ruleId: string; ruleVersion: number }
export function validateFinanceV2ReportQuery(query: FinanceV2ReportQuery): void {
  const length = planningDate(query.to) - planningDate(query.from);
  if (length < 1 || length > 366) throw new FinanceInputError('Intervalo de informe inválido.');
  financeReportCut(query.asOf);
}
export async function readFinanceV2CostReport(tx: FinanceSqlTransaction, input: FinanceV2ReportQuery & { businessId: string; timeZone: string }): Promise<FinanceCostReport> {
  validateFinanceV2ReportQuery(input);
  const cut = financeReportCut(input.asOf);
  const selected = await readFinanceCostSources(tx,input);
  const expenses = await tx.query<ExpenseDetail>('SELECT l.id,l."expenseId",l."bookingId",l."resourceId",l."categoryId",l."amountMinor",l.operational,e."consumedOn",e.version FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" WHERE l."businessId"=$1 AND e."consumedOn">=$2::date AND e."consumedOn"<$3::date AND e."createdAt"<=$4::timestamp ORDER BY l.id LIMIT 5001',[input.businessId,input.from,input.to,cut]);
  const labor = await tx.query<LaborDetail>('SELECT DISTINCT ON (l.id) l.id,l.kind,l."consumedOn",r.id AS "revisionId",r."revisionNo",r."actualExpenseLineId",r."estimatedMinor" FROM "FinanceLaborCost" l JOIN "FinanceLaborCostRevision" r ON r."laborId"=l.id AND r."businessId"=l."businessId" WHERE l."businessId"=$1 AND l."consumedOn">=$2::date AND l."consumedOn"<$3::date AND l."createdAt"<=$4::timestamp AND r."createdAt"<=$4::timestamp ORDER BY l.id,r."revisionNo" DESC LIMIT 5001',[input.businessId,input.from,input.to,cut]);
  const allocations = await tx.query<AllocationDetail>('SELECT DISTINCT ON (a."sourceExpenseLineId",a."sourceLaborRevisionId") a.id,a."revisionNo",a."sourceExpenseLineId",a."sourceLaborRevisionId",r."ruleId",r."revisionNo" AS "ruleVersion" FROM "FinanceCostAllocation" a JOIN "FinanceAllocationRuleRevision" r ON r.id=a."ruleRevisionId" AND r."businessId"=a."businessId" WHERE a."businessId"=$1 AND (a."sourceExpenseLineId"=ANY($2::text[]) OR a."sourceLaborRevisionId"=ANY($3::text[])) AND a."createdAt"<=$4::timestamp AND r."createdAt"<=$4::timestamp ORDER BY a."sourceExpenseLineId",a."sourceLaborRevisionId",a."revisionNo" DESC LIMIT 5001',[input.businessId,expenses.map(row=>row.id),labor.filter(row=>row.actualExpenseLineId===null).map(row=>row.revisionId),cut]);
  if (expenses.length + labor.length + allocations.length > 5000) throw new FinanceConflictError('La consulta supera 5000 fuentes.');
  const rows: FinanceCostRow[] = [];
  for (const source of [...selected.costSources,...selected.ownerWorkSources]) {
    if (!source.operational) continue;
    rows.push(reportSourceRow(source,expenses,labor,allocations));
  }
  for (const sourceId of selected.coverage.unknownSourceIds) {
    const row = labor.find(candidate => sourceId.endsWith(`:${candidate.revisionId}`));
    rows.push(unknownLaborRow(row));
  }
  rows.sort((left,right)=>left.source.kind.localeCompare(right.source.kind)||left.source.id.localeCompare(right.source.id));
  return { businessId:input.businessId,currency:'PYG',timeZone:input.timeZone,from:input.from,to:input.to,asOf:input.asOf,token:selected.token,sourceLimit:5000,basis:'SOURCE_COSTS',rows,totals:costReportTotals(rows,selected.coverage.unknownSourceIds.length),coverage:{...selected.coverage,unsupportedReasons:[]} };
}

function reportSourceRow(source:FinanceProfitabilityCostSource,expenses:readonly ExpenseDetail[],labor:readonly LaborDetail[],allocations:readonly AllocationDetail[]):FinanceCostRow{
  const expense=expenses.find(row=>source.sourceId===`EXPENSE_LINE:${row.id}`);
  const laborSource=labor.find(row=>source.sourceId===`${row.kind==='OWNER_IMPUTED'?'OWNER_IMPUTED':'LABOR_ESTIMATE'}:${row.revisionId}`);
  assertReportSourceDetails(source,expense,laborSource);
  const allocation=allocations.find(row=>expense?row.sourceExpenseLineId===expense.id:row.sourceLaborRevisionId===laborSource?.revisionId);
  if(expense)return expenseReportRow(source,expense,labor.some(row=>row.actualExpenseLineId===expense.id),allocation);
  return laborReportRow(source,laborSource!,allocation);
}
function sourceReference(source:FinanceProfitabilityCostSource,kind:FinanceCostRow['source']['kind'],id:string):FinanceCostRow['source']{
  return{kind,id,version:source.sourceVersion,hash:createHash('sha256').update(JSON.stringify(source)).digest('hex')};
}
function allocationFields(source:FinanceProfitabilityCostSource,allocation:AllocationDetail|undefined):Pick<FinanceCostRow,'ruleId'|'ruleVersion'|'allocationVersion'|'destinations'|'unassignedMinor'>{
  const destinations=source.allocations.filter((part):part is{resourceId:string;amountMinor:number}=>part.resourceId!==null);
  return{ruleId:allocation?.ruleId??null,ruleVersion:allocation?.ruleVersion??null,allocationVersion:allocation?.revisionNo??0,destinations,unassignedMinor:sumMoney(source.allocations.filter(part=>part.resourceId===null).map(part=>part.amountMinor))};
}
function expenseReportRow(source:FinanceProfitabilityCostSource,expense:ExpenseDetail,laborActual:boolean,allocation:AllocationDetail|undefined):FinanceCostRow{
  const kind=laborActual?'LABOR':expense.resourceId!==null||expense.bookingId!==null?'DIRECT':'COMMON';
  return{source:sourceReference(source,'EXPENSE_LINE',expense.id),expenseId:expense.expenseId,expenseLineId:expense.id,bookingId:expense.bookingId,resourceId:expense.resourceId,categoryId:expense.categoryId,consumedOn:source.consumedOn,basis:source.basis,kind,amountMinor:source.amountMinor,...allocationFields(source,allocation)};
}
function laborReportRow(source:FinanceProfitabilityCostSource,labor:LaborDetail,allocation:AllocationDetail|undefined):FinanceCostRow{
  const owner=labor.kind==='OWNER_IMPUTED';
  return{source:sourceReference(source,owner?'OWNER_IMPUTED':'LABOR_ESTIMATE',labor.id),expenseId:null,expenseLineId:null,bookingId:null,resourceId:null,categoryId:null,consumedOn:source.consumedOn,basis:source.basis,kind:owner?'OWNER_WORK':'LABOR',amountMinor:source.amountMinor,...allocationFields(source,allocation)};
}
function unknownLaborRow(row:LaborDetail|undefined):FinanceCostRow{
  if(!row||row.estimatedMinor!==null)throw new FinanceCostSourceStaleError();
  return{source:{kind:row.kind==='OWNER_IMPUTED'?'OWNER_IMPUTED':'LABOR_ESTIMATE',id:row.id,version:row.revisionNo,hash:createHash('sha256').update(JSON.stringify({id:row.id,revisionId:row.revisionId,amountMinor:null})).digest('hex')},expenseId:null,expenseLineId:null,bookingId:null,resourceId:null,categoryId:null,consumedOn:sqlDate(row.consumedOn),basis:'ESTIMATE',kind:row.kind==='OWNER_IMPUTED'?'OWNER_WORK':'LABOR',amountMinor:null,ruleId:null,ruleVersion:null,allocationVersion:0,destinations:[],unassignedMinor:null};
}
function costReportTotals(rows:readonly FinanceCostRow[],unknownSourceCount:number):FinanceCostReport['totals']{
  return{actualCostMinor:sumMoney(rows.filter(row=>row.basis==='ACTUAL').map(row=>row.amountMinor!)),estimatedSelectedMinor:sumMoney(rows.filter(row=>row.basis==='ESTIMATE'&&row.kind!=='OWNER_WORK'&&row.amountMinor!==null).map(row=>row.amountMinor!)),ownerImputedMinor:sumMoney(rows.filter(row=>row.kind==='OWNER_WORK'&&row.amountMinor!==null).map(row=>row.amountMinor!)),unknownSourceCount};
}

function assertReportSourceDetails(source: FinanceProfitabilityCostSource, expense: ExpenseDetail | undefined, labor: LaborDetail | undefined): void {
  if (expense) {
    if (source.sourceVersion !== expense.version || source.amountMinor !== safeMoney(expense.amountMinor) || source.consumedOn !== sqlDate(expense.consumedOn)) throw new FinanceCostSourceStaleError();
    return;
  }
  if (!labor || labor.estimatedMinor === null) throw new FinanceCostSourceStaleError();
  if (source.sourceVersion !== labor.revisionNo || source.amountMinor !== safeMoney(labor.estimatedMinor) || source.consumedOn !== sqlDate(labor.consumedOn)) throw new FinanceCostSourceStaleError();
}
