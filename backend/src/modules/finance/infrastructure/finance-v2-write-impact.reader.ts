import type { FinanceV2Mutation } from '../domain/finance-v2.types';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { parseHistoryImportCsv } from '../application/finance-v2-import';
import { parseBankStatementCsv } from '../application/finance-v2-bank-statement';
import { FinanceInputError } from '../domain/finance.errors';
import { bankLocalDate } from './finance-v2-bank-source.sql-reader';
import { sqlDate } from './finance-v2-draft.sql-store';

export interface FinanceV2WriteImpact { dates:string[];changedSourceRefs:{type:string;id:string}[] }
/** Root calls the shared assertFinancePeriodOpen(native tx, biz, dates, refs) before any writer. */
export async function readFinanceV2WriteImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,timeZone:string):Promise<FinanceV2WriteImpact>{
  const impact:FinanceV2WriteImpact={dates:[],changedSourceRefs:[]};const c=input.command;
  if(c.type==='CONFIRM_HISTORY_IMPORT')await historyImpact(tx,input,timeZone,impact);
  else if(c.type==='CONFIRM_BANK_STATEMENT'||c.type==='CONFIRM_BANK_MATCH'||c.type==='CANCEL_BANK_MATCH')await bankImpact(tx,input,timeZone,impact);
  else if(['CREATE_BUDGET_REVISION','APPROVE_BUDGET_REVISION','CREATE_COMMITMENT','CANCEL_COMMITMENT','CONVERT_COMMITMENT'].includes(c.type))await planningImpact(tx,input,timeZone,impact);
  else if(['CREATE_ALLOCATION_RULE','REVISE_ALLOCATION_RULE','APPLY_COST_ALLOCATION','CREATE_LABOR_COST','REVISE_LABOR_COST'].includes(c.type))await costImpact(tx,input,impact);
  else await draftImpact(tx,input,timeZone,impact);
  return{dates:[...new Set(impact.dates)].sort(),changedSourceRefs:impact.changedSourceRefs};
}
async function historyImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,timeZone:string,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;if(c.type!=='CONFIRM_HISTORY_IMPORT')return;
  const parsed=parseHistoryImportCsv(c.csv);if(parsed.errors.length)throw new FinanceInputError('IMPORT_CSV_INVALID');
  const prior=await tx.query<{externalKey:string}>('SELECT "externalKey" FROM "FinanceImportItem" WHERE "businessId"=$1 AND "sourceNamespace"=$2 AND "externalKey"=ANY($3::text[])',[input.businessId,c.sourceNamespace.trim(),parsed.sources.map(source=>source.externalKey)]);
  const existing=new Set(prior.map(row=>row.externalKey));
  for(const source of parsed.sources){if(existing.has(source.externalKey))continue;impact.dates.push(source.kind==='EXPENSE'?source.consumedOn:bankLocalDate(source.occurredAt,timeZone));}
}
async function bankImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,timeZone:string,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;
  if(c.type==='CONFIRM_BANK_STATEMENT'){const parsed=parseBankStatementCsv(c.csv);if(parsed.errors.length)throw new FinanceInputError('BANK_CSV_INVALID');impact.dates.push(...parsed.rows.map(row=>row.bookedOn));return;}
  if(c.type==='CONFIRM_BANK_MATCH'){
    const rows=await tx.query<{id:string;bookedOn:Date}>('SELECT id,"bookedOn" FROM "FinanceBankRow" WHERE "businessId"=$1 AND id=ANY($2::text[])',[input.businessId,c.rows.map(row=>row.id)]);
    rows.forEach(row=>{impact.dates.push(sqlDate(row.bookedOn));impact.changedSourceRefs.push({type:'BANK_ROW',id:row.id});});
    for(const fee of c.fees)if('expenseDefinition'in fee){impact.dates.push(fee.consumedOn!,bankLocalDate(fee.occurredAt!,timeZone));}
    // Linking a receipt changes its account provenance; the shared Payment source type is canonical.
    impact.changedSourceRefs.push(...c.paymentLinks.map(link=>({type:'PAYMENT',id:link.paymentId})));return;
  }
  if(c.type==='CANCEL_BANK_MATCH'){
    const rows=await tx.query<{bookedOn:Date}>('SELECT b."bookedOn" FROM "FinanceBankMatchRow" r JOIN "FinanceBankRow" b ON b.id=r."bankRowId" AND b."businessId"=r."businessId" WHERE r."businessId"=$1 AND r."matchId"=$2',[input.businessId,c.id]);
    impact.dates.push(...rows.map(row=>sqlDate(row.bookedOn)));impact.changedSourceRefs.push({type:'BANK_MATCH',id:c.id});
  }
}
async function planningImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,timeZone:string,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;
  if(c.type==='CREATE_BUDGET_REVISION'){impact.dates.push(c.periodMonth+'-01');return;}
  if(c.type==='APPROVE_BUDGET_REVISION'){const rows=await tx.query<{budgetId:string;periodMonth:string}>('SELECT r."budgetId",b."periodMonth" FROM "FinanceBudgetRevision" r JOIN "FinanceBudget" b ON b.id=r."budgetId" AND b."businessId"=r."businessId" WHERE r."businessId"=$1 AND r.id=$2',[input.businessId,c.id]);rows.forEach(row=>{impact.dates.push(row.periodMonth+'-01');impact.changedSourceRefs.push({type:'BUDGET',id:row.budgetId},{type:'BUDGET_REVISION',id:c.id});});return;}
  if(c.type==='CREATE_COMMITMENT'){impact.dates.push(c.expectedConsumptionOn);return;}
  if(c.type==='CANCEL_COMMITMENT'||c.type==='CONVERT_COMMITMENT'){
    const rows=await tx.query<{expectedConsumptionOn:Date}>('SELECT "expectedConsumptionOn" FROM "FinanceCommitment" WHERE "businessId"=$1 AND id=$2',[input.businessId,c.id]);impact.dates.push(...rows.map(row=>sqlDate(row.expectedConsumptionOn)));impact.changedSourceRefs.push({type:'COMMITMENT',id:c.id});
    if(c.type==='CONVERT_COMMITMENT')await conversionImpact(tx,input,timeZone,impact);
  }
}
async function conversionImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,timeZone:string,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;if(c.type!=='CONVERT_COMMITMENT')return;
  if(c.expense){impact.dates.push(c.expense.consumedOn);if(c.expense.settlement)impact.dates.push(bankLocalDate(c.expense.settlement.occurredAt,timeZone));}
  else{const rows=await tx.query<{consumedOn:Date}>('SELECT "consumedOn" FROM "FinanceExpenseDraft" WHERE "businessId"=$1 AND id=$2',[input.businessId,c.expenseDraftId]);impact.dates.push(...rows.map(row=>sqlDate(row.consumedOn)));impact.changedSourceRefs.push({type:'EXPENSE_DRAFT',id:c.expenseDraftId});}
}
async function costImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;
  if(c.type==='CREATE_ALLOCATION_RULE'||c.type==='REVISE_ALLOCATION_RULE'){impact.dates.push(c.validFrom);if(c.type==='REVISE_ALLOCATION_RULE')impact.changedSourceRefs.push({type:'COST_RULE',id:c.id});return;}
  if(c.type==='CREATE_LABOR_COST'){impact.dates.push(c.consumedOn);return;}
  if(c.type==='REVISE_LABOR_COST'){const rows=await tx.query<{consumedOn:Date}>('SELECT "consumedOn" FROM "FinanceLaborCost" WHERE "businessId"=$1 AND id=$2',[input.businessId,c.id]);impact.dates.push(...rows.map(row=>sqlDate(row.consumedOn)));impact.changedSourceRefs.push({type:'LABOR_COST',id:c.id});return;}
  if(c.type==='APPLY_COST_ALLOCATION')await allocationImpact(tx,input,impact);
}
async function allocationImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;if(c.type!=='APPLY_COST_ALLOCATION')return;
  if(c.source.kind==='EXPENSE_LINE'){
    const rows=await tx.query<{consumedOn:Date}>('SELECT e."consumedOn" FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" WHERE l."businessId"=$1 AND l.id=$2',[input.businessId,c.source.id]);impact.dates.push(...rows.map(row=>sqlDate(row.consumedOn)));impact.changedSourceRefs.push({type:'EXPENSE_LINE',id:c.source.id});
  }else{
    const rows=await tx.query<{consumedOn:Date}>('SELECT "consumedOn" FROM "FinanceLaborCost" WHERE "businessId"=$1 AND id=$2',[input.businessId,c.source.id]);impact.dates.push(...rows.map(row=>sqlDate(row.consumedOn)));impact.changedSourceRefs.push({type:'LABOR_COST',id:c.source.id});
  }
}
async function draftImpact(tx:FinanceSqlTransaction,input:FinanceV2Mutation,timeZone:string,impact:FinanceV2WriteImpact):Promise<void>{
  const c=input.command;
  if(c.type==='REIMBURSE_EXPENSE'){impact.dates.push(bankLocalDate(c.settlement.occurredAt,timeZone));return;}
  if('consumedOn'in c)impact.dates.push(c.consumedOn);
  if('id'in c){const rows=await tx.query<{consumedOn:Date}>('SELECT "consumedOn" FROM "FinanceExpenseDraft" WHERE "businessId"=$1 AND id=$2',[input.businessId,c.id]);impact.dates.push(...rows.map(row=>sqlDate(row.consumedOn)));impact.changedSourceRefs.push({type:c.type==='REVISE_EXPENSE_TEMPLATE'?'EXPENSE_TEMPLATE':'EXPENSE_DRAFT',id:c.id});}
  if(c.type==='CONFIRM_EXPENSE_DRAFT'&&c.settlement)impact.dates.push(bankLocalDate(c.settlement.occurredAt,timeZone));
}
