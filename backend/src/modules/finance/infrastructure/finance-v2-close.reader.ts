import { createHash } from 'node:crypto';
import { FinanceConflictError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { financeReportCut } from './finance-v2-report.cut';

type CloseJson = null | boolean | number | string | CloseJson[] | { [key: string]: CloseJson };
export interface FinanceV2CloseReadResult {
  payload: CloseJson; sourceRefs: { type: string; id: string; version: string }[];
  guardSourceRefs: { type: string; id: string; version: string }[];
  token: string; sourceCount: number; complete: true; missingSources: [];
}
const TABLES = [
  ['FinanceImportBatch','IMPORT_BATCH'], ['FinanceImportItem','IMPORT_ITEM'],
  ['FinanceExpenseTemplate','EXPENSE_TEMPLATE'], ['FinanceExpenseTemplateRevision','EXPENSE_TEMPLATE_REVISION'], ['FinanceExpenseTemplateLine','EXPENSE_TEMPLATE_LINE'],
  ['FinanceExpenseDraft','EXPENSE_DRAFT'], ['FinanceExpenseDraftLine','EXPENSE_DRAFT_LINE'], ['FinanceDraftDecision','DRAFT_DECISION'], ['FinanceApprovalPolicyRevision','APPROVAL_POLICY'],
  ['FinanceReimbursementDraft','REIMBURSEMENT_DRAFT'], ['FinanceReimbursementClaim','REIMBURSEMENT_CLAIM'],
  ['FinanceBankStatement','BANK_STATEMENT'], ['FinanceBankRow','BANK_ROW'], ['FinanceBankMatch','BANK_MATCH'], ['FinanceBankMatchRow','BANK_MATCH_ROW'], ['FinanceBankMatchComponent','BANK_MATCH_COMPONENT'], ['FinanceBankFeeOrigin','BANK_FEE_ORIGIN'],
  ['FinanceAllocationRule','COST_RULE'], ['FinanceAllocationRuleRevision','COST_RULE_REVISION'], ['FinanceAllocationRulePart','COST_RULE_PART'], ['FinanceCostAllocation','COST_ALLOCATION'], ['FinanceCostAllocationPart','COST_ALLOCATION_PART'],
  ['FinanceLaborCost','LABOR_COST'], ['FinanceLaborCostRevision','LABOR_REVISION'],
  ['FinanceBudget','BUDGET'], ['FinanceBudgetRevision','BUDGET_REVISION'], ['FinanceBudgetLine','BUDGET_LINE'], ['FinanceCommitment','COMMITMENT'], ['FinanceCommitmentConversion','COMMITMENT_CONVERSION'],
] as const;

/** Caller already authorizes OWNER and owns the shared transaction/business lock. */
export async function readFinanceV2CloseSources(tx: FinanceSqlTransaction, input: { businessId: string; from: string; to: string; asOf: string }): Promise<FinanceV2CloseReadResult> {
  const cut = financeReportCut(input.asOf);
  const payload: { [key: string]: CloseJson } = {};
  const sourceRefs: FinanceV2CloseReadResult['sourceRefs'] = [];
  let sourceCount = 0;
  for (const [table, type] of TABLES) {
    // Identifiers are from this closed constant; all request values are parameters.
    const rows = await tx.query<Record<string, unknown>>(`SELECT * FROM "${table}" WHERE "businessId"=$1 AND "createdAt"<=$2::timestamp ORDER BY id LIMIT 5001`, [input.businessId, cut]);
    if (rows.length > 5000) throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_LIMIT_EXCEEDED');
    sourceCount += rows.length;
    if (sourceCount > 5000) throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_LIMIT_EXCEEDED');
    payload[type] = rows.map(row => jsonValue(row));
    for (const row of rows) {
      sourceRefs.push(closeSourceRef(type,row));
    }
  }
  const token = createHash('sha256').update(JSON.stringify({ businessId: input.businessId, from: input.from, to: input.to, payload, sourceRefs })).digest('hex');
  const baseGuardSourceRefs=await readFinanceBaseGuardRefs(tx,payload,input);
  const guardSourceRefs=financeV2ScopedGuardRefs(payload,sourceRefs,{...input,baseGuardSourceRefs});
  return { payload, sourceRefs, guardSourceRefs, token, sourceCount, complete: true, missingSources: [] };
}
function closeSourceRef(type:string,row:Record<string,unknown>):FinanceV2CloseReadResult['sourceRefs'][number]{
  if (typeof row.id !== 'string') throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_ID_INVALID');
  const version = row.version ?? row.revisionNo ?? 1;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_VERSION_INVALID');
  return{type,id:row.id,version:String(version)};
}

function jsonValue(value: unknown): CloseJson {
  if (isClosePrimitive(value)) return value as null|boolean|string;
  if (typeof value === 'bigint') return safeMoney(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new FinanceConflictError('FINANCE_CLOSE_MONEY_OVERFLOW');
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => {
      if (key === 'csv' || key === 'rawCsv') throw new FinanceConflictError('FINANCE_CLOSE_RAW_CSV_PROHIBITED');
      return [key, jsonValue(child)];
    }));
  }
  throw new FinanceConflictError('FINANCE_CLOSE_JSON_INVALID');
}
function isClosePrimitive(value:unknown):boolean{return value===null||typeof value==='boolean'||typeof value==='string';}
function closeRef(value:CloseJson|undefined):string{
  if(value===null||value===undefined)return'';
  if(typeof value!=='string')throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_REFERENCE_INVALID');
  return value;
}

function financeV2ScopedGuardRefs(payload:{[key:string]:CloseJson},refs:FinanceV2CloseReadResult['sourceRefs'],input:{from:string;to:string;baseGuardSourceRefs:readonly{type:string;id:string}[]}):FinanceV2CloseReadResult['guardSourceRefs']{
  const selected=new Map<string,Set<string>>();
  const rows=(type:string):Record<string,CloseJson>[]=>((payload[type]??[])as Record<string,CloseJson>[]);
  const inPeriod=(value:CloseJson|undefined):boolean=>typeof value==='string'&&value.slice(0,10)>=input.from&&value.slice(0,10)<input.to;
  const ids=(type:string):Set<string>=>{let value=selected.get(type);if(!value){value=new Set();selected.set(type,value);}return value;};
  const add=(type:string,predicate:(row:Record<string,CloseJson>)=>boolean):void=>{for(const row of rows(type))if(predicate(row))ids(type).add(closeRef(row.id));};
  add('BUDGET',row=>inPeriod(closeRef(row.periodMonth)+'-01'));
  add('COMMITMENT',row=>inPeriod(row.expectedConsumptionOn));
  add('LABOR_COST',row=>inPeriod(row.consumedOn));
  add('COST_ALLOCATION',row=>inPeriod(row.consumedOn));
  add('BANK_ROW',row=>inPeriod(row.bookedOn));
  add('EXPENSE_DRAFT',row=>row.confirmedExpenseId!==null&&inPeriod(row.consumedOn));
  const depend=(child:string,parent:string,field:string):void=>add(child,row=>ids(parent).has(closeRef(row[field])));
  depend('BUDGET_REVISION','BUDGET','budgetId');depend('BUDGET_LINE','BUDGET_REVISION','revisionId');
  depend('COMMITMENT_CONVERSION','COMMITMENT','commitmentId');depend('LABOR_REVISION','LABOR_COST','laborId');
  depend('COST_ALLOCATION_PART','COST_ALLOCATION','allocationId');
  const ruleRevisions=new Set(rows('COST_ALLOCATION').filter(row=>ids('COST_ALLOCATION').has(closeRef(row.id))).map(row=>closeRef(row.ruleRevisionId)));
  add('COST_RULE_REVISION',row=>ruleRevisions.has(closeRef(row.id)));depend('COST_RULE_PART','COST_RULE_REVISION','revisionId');
  add('BANK_MATCH_ROW',row=>ids('BANK_ROW').has(closeRef(row.bankRowId)));
  const matches=new Set(rows('BANK_MATCH_ROW').filter(row=>ids('BANK_MATCH_ROW').has(closeRef(row.id))).map(row=>closeRef(row.matchId)));
  add('BANK_MATCH',row=>matches.has(closeRef(row.id)));depend('BANK_MATCH_COMPONENT','BANK_MATCH','matchId');depend('BANK_FEE_ORIGIN','BANK_ROW','bankRowId');
  const statements=new Set(rows('BANK_ROW').filter(row=>ids('BANK_ROW').has(closeRef(row.id))).map(row=>closeRef(row.statementId)));
  add('BANK_STATEMENT',row=>statements.has(closeRef(row.id)));
  depend('EXPENSE_DRAFT_LINE','EXPENSE_DRAFT','draftId');depend('DRAFT_DECISION','EXPENSE_DRAFT','draftId');depend('REIMBURSEMENT_DRAFT','EXPENSE_DRAFT','draftId');
  const policies=new Set(rows('EXPENSE_DRAFT').filter(row=>ids('EXPENSE_DRAFT').has(closeRef(row.id))).map(row=>closeRef(row.approvalPolicyRevisionId)));
  add('APPROVAL_POLICY',row=>policies.has(closeRef(row.id)));
  const revisions=new Set(rows('EXPENSE_DRAFT').filter(row=>ids('EXPENSE_DRAFT').has(closeRef(row.id))).map(row=>closeRef(row.templateRevisionId)));
  add('EXPENSE_TEMPLATE_REVISION',row=>revisions.has(closeRef(row.id)));depend('EXPENSE_TEMPLATE_LINE','EXPENSE_TEMPLATE_REVISION','revisionId');
  const base=new Set(input.baseGuardSourceRefs.map(ref=>`${ref.type}:${ref.id}`));
  add('REIMBURSEMENT_CLAIM',row=>base.has(`EXPENSE:${closeRef(row.expenseId)}`));
  add('IMPORT_ITEM',row=>importRefInScope(row,base));
  const batches=new Set(rows('IMPORT_ITEM').filter(row=>ids('IMPORT_ITEM').has(closeRef(row.id))).map(row=>closeRef(row.batchId)));
  add('IMPORT_BATCH',row=>batches.has(closeRef(row.id)));
  return refs.filter(ref=>selected.get(ref.type)?.has(ref.id));
}
function importRefInScope(row:Record<string,CloseJson>,base:ReadonlySet<string>):boolean{return base.has(`EXPENSE:${closeRef(row.expenseId)}`)||base.has(`SETTLEMENT:${closeRef(row.settlementId)}`)||base.has(`OPENING:${closeRef(row.openingId)}`);}
interface BaseGuardRow{id:string;date:string;currency:string}
async function readFinanceBaseGuardRefs(tx:FinanceSqlTransaction,payload:{[key:string]:CloseJson},input:{businessId:string;from:string;to:string}):Promise<{type:string;id:string}[]>{
  const items=(payload.IMPORT_ITEM??[])as Record<string,CloseJson>[];
  const claims=(payload.REIMBURSEMENT_CLAIM??[])as Record<string,CloseJson>[];
  const ids=(field:string,extra:readonly Record<string,CloseJson>[]=[]):string[]=>[...new Set([...items,...extra].flatMap(row=>typeof row[field]==='string'?[row[field]]:[]))];
  const expenseIds=ids('expenseId',claims);const settlementIds=ids('settlementId');const openingIds=ids('openingId');
  const expenses=await tx.query<BaseGuardRow>('SELECT id,"consumedOn"::text AS date,\'PYG\'::text AS currency FROM "FinanceExpense" WHERE "businessId"=$1 AND id=ANY($2::text[]) LIMIT 5001',[input.businessId,expenseIds]);
  const settlements=await tx.query<BaseGuardRow>('SELECT s.id,to_char((s."occurredAt" AT TIME ZONE \'UTC\') AT TIME ZONE b.timezone,\'YYYY-MM-DD\') AS date,b.currency FROM "FinanceSettlement" s JOIN "FinanceAccount" a ON a.id=s."accountId" AND a."businessId"=s."businessId" JOIN "Business" b ON b.id=a."businessId" WHERE s."businessId"=$1 AND s.id=ANY($2::text[]) LIMIT 5001',[input.businessId,settlementIds]);
  const openings=await tx.query<BaseGuardRow>('SELECT o.id,to_char((o."occurredAt" AT TIME ZONE \'UTC\') AT TIME ZONE b.timezone,\'YYYY-MM-DD\') AS date,b.currency FROM "FinanceOpening" o JOIN "FinanceAccount" a ON a.id=o."accountId" AND a."businessId"=o."businessId" JOIN "Business" b ON b.id=a."businessId" WHERE o."businessId"=$1 AND o.id=ANY($2::text[]) LIMIT 5001',[input.businessId,openingIds]);
  requireBaseGuardRows(expenses,expenseIds);requireBaseGuardRows(settlements,settlementIds);requireBaseGuardRows(openings,openingIds);
  return[...expenses.filter(row=>row.date>=input.from&&row.date<input.to).map(row=>({type:'EXPENSE',id:row.id})),...settlements.filter(row=>row.date<input.to).map(row=>({type:'SETTLEMENT',id:row.id})),...openings.filter(row=>row.date<input.to).map(row=>({type:'OPENING',id:row.id}))];
}
function requireBaseGuardRows(rows:readonly BaseGuardRow[],ids:readonly string[]):void{
  if(rows.length!==ids.length||rows.length>5000)throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_FK_MISSING');
  for(const row of rows)if(row.currency!=='PYG'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(`${row.date}T00:00:00.000Z`)))throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_BASIS_INVALID');
}
