import { ApiResponseError, apiRequest } from '../../../shared/api/api-client';
import type { FinanceContext } from '../api/finance-api';
import type { FinanceV2Command, FinanceV2Result, FinanceV2Page, FinanceExpenseDraftDto, FinanceExpenseTemplateDto, FinanceApprovalPolicyDto, FinanceBankStatementDto, FinanceBankMatchDto, FinanceAllocationRuleDto, FinanceLaborCostDto, FinanceCommitmentDto, FinanceBudgetDto, FinanceCostReport, FinanceResourceReport, FinanceAging, FinanceHistoryPreviewInput, FinanceHistoryPreview, FinanceBankStatementPreviewInput, FinanceBankStatementPreview, FinanceBankMatchPreviewInput, FinanceBankMatchPreview, FinanceCashProjectionInput, FinanceCashProjection } from './finance-v2.types';
import type { FinanceBankMatchSource } from './v2-ui.types';
import type { FinanceBudgetComparison, FinanceBudgetForecastBasis } from './finance-v2.types';
import type { FinanceAlertsReadResult } from './finance-alerts.types';

const base = (context:FinanceContext) => `/businesses/${encodeURIComponent(context.businessId)}/finance/v2`;
export const validV2Version = (version:unknown) => typeof version === 'number' && Number.isSafeInteger(version) && version >= 1;
export const validV2Id = (id:unknown) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export interface V2Collections { drafts:FinanceExpenseDraftDto; templates:FinanceExpenseTemplateDto; 'bank-statements':FinanceBankStatementDto; 'bank-matches':FinanceBankMatchDto; 'allocation-rules':FinanceAllocationRuleDto; 'labor-costs':FinanceLaborCostDto; commitments:FinanceCommitmentDto }
export async function getV2Page<K extends keyof V2Collections>(context:FinanceContext, collection:K, cursor:string|null, signal?:AbortSignal) {
  const query = new URLSearchParams({ limit:'50' }); if(cursor) query.set('cursor',cursor);
  const page = await apiRequest<FinanceV2Page<V2Collections[K]>>(`${base(context)}/${collection}?${query}`,{ accessToken:context.accessToken,signal });
  if(!page || !Array.isArray(page.items) || !(page.nextCursor === null || typeof page.nextCursor === 'string') || page.items.some((item)=>item.businessId !== context.businessId || !validV2Id(item.id) || ('version' in item && !validV2Version(item.version)))) throw new ApiResponseError();
  return page;
}
export async function getV2AllPages<K extends keyof V2Collections>(context:FinanceContext,collection:K,signal?:AbortSignal):Promise<V2Collections[K][]> {
  const items:V2Collections[K][]=[];const cursors=new Set<string>();let cursor:string|null=null;
  do {const page:FinanceV2Page<V2Collections[K]>=await getV2Page(context,collection,cursor,signal);items.push(...page.items);if(items.length>5000||new Set(items.map((item)=>item.id)).size!==items.length)throw new ApiResponseError();cursor=page.nextCursor;if(cursor){if(cursors.has(cursor)||cursors.size>=100)throw new ApiResponseError();cursors.add(cursor);}}while(cursor);
  return items;
}
export async function getV2Policy(context:FinanceContext,signal?:AbortSignal) {
  const policy = await apiRequest<FinanceApprovalPolicyDto>(`${base(context)}/approval-policy`,{ accessToken:context.accessToken,signal });
  if(!policy || policy.businessId !== context.businessId || !Number.isSafeInteger(policy.version) || policy.version < 0 || typeof policy.enabled !== 'boolean') throw new ApiResponseError();
  return policy;
}
export async function getV2Budget(context:FinanceContext,month:string,signal?:AbortSignal) {
  // This nullable GET uses Nest's empty successful body when no monthly head exists.
  // Keep this compatibility local: whitespace, malformed JSON and invalid DTOs remain errors.
  const body = await apiRequest<string>(`${base(context)}/budget?${new URLSearchParams({ periodMonth:month })}`,{ accessToken:context.accessToken,signal,responseType:'text' });
  let budget:FinanceBudgetDto|null;
  if(body==='')budget=null;
  else { try { budget=JSON.parse(body) as FinanceBudgetDto|null; } catch { throw new ApiResponseError(); } }
  if(budget !== null && (!budget || budget.businessId !== context.businessId || budget.periodMonth !== month || !validV2Version(budget.version))) throw new ApiResponseError();
  return budget;
}
export async function getV2BudgetComparison(context:FinanceContext,month:string,signal?:AbortSignal,forecastBasis:FinanceBudgetForecastBasis|null=null) {
  if(forecastBasis!==null&&forecastBasis!=='ACTUAL_PLUS_PENDING_COMMITMENTS')throw new ApiResponseError();
  const query = new URLSearchParams({ periodMonth: month });
  if (forecastBasis !== null) query.set('forecastBasis', forecastBasis);
  const comparison=await apiRequest<FinanceBudgetComparison>(`${base(context)}/budget-comparison?${query}`,{accessToken:context.accessToken,signal});
  const coverage=comparison?.coverage;
  if(!comparison||!Array.isArray(comparison.lines)||comparison.to!==budgetMonthEnd(month)||comparison.approvedRevisionId===null&&comparison.lines.some((line)=>!line||line.approvedMinor!==null||line.actualDeviationMinor!==null||line.forecastDeviationMinor!==null))throw new ApiResponseError();
  if(!comparison||comparison.businessId!==context.businessId||comparison.currency!=='PYG'||!validV2Id(comparison.budgetId)||!validV2Version(comparison.budgetVersion)||!(comparison.approvedRevisionId===null||validV2Id(comparison.approvedRevisionId))||!Array.isArray(comparison.lines)||comparison.lines.length>5000||typeof comparison.from!=='string'||comparison.from!==`${month}-01`||typeof comparison.asOf!=='string'||!Number.isFinite(Date.parse(comparison.asOf))||typeof comparison.token!=='string'||!comparison.token||comparison.forecastBasis!==forecastBasis||!(forecastBasis===null?comparison.scenarioToken===null:typeof comparison.scenarioToken==='string'&&comparison.scenarioToken.length>0)||!nonnegativeMoney(comparison.estimatedSelectedMinor)||!nonnegativeMoney(comparison.ownerImputedMinor)||!coverage||coverage.scope!=='KNOWN_OPERATING_SOURCES_ONLY'||coverage.sourceLimit!==5000||typeof coverage.costSourceToken!=='string'||!coverage.costSourceToken||!sourceCount(coverage.costSourceCount)||!sourceCount(coverage.pendingCommitmentSourceCount)||!strings(coverage.unknownCostSourceIds)||!strings(coverage.missingEvidenceSourceIds)||!strings(coverage.unsupportedReasons)||comparison.lines.some((line)=>!line||!nonnegativeMoney(line.actualMinor)||!nonnegativeMoney(line.committedPendingMinor)||!nullableMoney(line.approvedMinor,true)||!nullableMoney(line.actualDeviationMinor,false)||!nullableMoney(line.forecastDeviationMinor,false)||(forecastBasis===null?line.forecastMinor!==null||line.forecastDeviationMinor!==null:!nonnegativeMoney(line.forecastMinor))))throw new ApiResponseError();
  return comparison;
}
function nonnegativeMoney(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
function nullableMoney(value:unknown,nonnegative:boolean){return value===null||typeof value==='number'&&Number.isSafeInteger(value)&&(!nonnegative||value>=0);}
function sourceCount(value:unknown){return nonnegativeMoney(value)&&(value as number)<=5000;}
function strings(value:unknown){return Array.isArray(value)&&value.length<=5000&&value.every((item)=>typeof item==='string');}
function budgetMonthEnd(month:string){const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);if(!match)return null;const year=Number(match[1]);const ordinal=Number(match[2]);return `${String(ordinal===12?year+1:year).padStart(4,'0')}-${String(ordinal===12?1:ordinal+1).padStart(2,'0')}-01`;}
export async function getV2Report<K extends 'costs'|'resource-results'>(context:FinanceContext,kind:K,period:{from:string;to:string;asOf?:string},signal?:AbortSignal) {
  const query=new URLSearchParams({from:period.from,to:period.to});if(period.asOf)query.set('asOf',period.asOf);
  const report = await apiRequest<K extends 'costs'?FinanceCostReport:FinanceResourceReport>(`${base(context)}/${kind}?${query}`,{ accessToken:context.accessToken,signal });
  if(!report || report.businessId !== context.businessId || report.currency !== 'PYG' || report.from !== period.from || report.to !== period.to || (period.asOf&&report.asOf!==period.asOf) || typeof report.token !== 'string' || !Array.isArray(report.rows)) throw new ApiResponseError();
  return report;
}
export async function getV2Aging(context:FinanceContext,asOf:string,signal?:AbortSignal) {
  const result = await apiRequest<FinanceAging>(`${base(context)}/aging?${new URLSearchParams({asOf})}`,{accessToken:context.accessToken,signal});
  if(!result || result.businessId !== context.businessId || result.currency !== 'PYG' || result.asOf !== asOf || !Array.isArray(result.rows)) throw new ApiResponseError();
  return result;
}
export async function getV2Alerts(context:FinanceContext,period:{from:string;to:string;asOf:string},signal?:AbortSignal) {
  const result=await apiRequest<FinanceAlertsReadResult>(`${base(context)}/alerts?${new URLSearchParams(period)}`,{accessToken:context.accessToken,signal});
  if(!result||result.businessId!==context.businessId||result.currency!=='PYG'||result.from!==period.from||result.to!==period.to||result.asOf!==period.asOf||typeof result.token!=='string'||result.basis!=='CURRENT_OPERATIONS_AND_SERVICE_COVERAGE'||!Array.isArray(result.items))throw new ApiResponseError();
  return result;
}
export async function getV2BankSources(context:FinanceContext,accountId:string,signal?:AbortSignal) {
  const sources = await apiRequest<FinanceBankMatchSource[]>(`${base(context)}/bank-match-sources?${new URLSearchParams({accountId})}`,{accessToken:context.accessToken,signal});
  if(!Array.isArray(sources) || sources.some((source)=>!validV2Version(source.sourceVersion) || typeof source.sourceHash !== 'string' || !source.sourceHash || (source.accountId !== null && source.accountId !== accountId) || !Number.isSafeInteger(source.residualMinor))) throw new ApiResponseError();
  return sources;
}
export async function executeV2Command(context:FinanceContext,command:FinanceV2Command,key:string) {
  const result = await apiRequest<FinanceV2Result>(`${base(context)}/commands`,{method:'POST',accessToken:context.accessToken,skipUnauthorizedRecovery:true,headers:{'Idempotency-Key':key},body:JSON.stringify(command)});
  if(!result || !validV2Id(result.id) || !validV2Version(result.version) || result.type !== command.type) throw new ApiResponseError();
  return result;
}
export async function previewV2History(context:FinanceContext,input:FinanceHistoryPreviewInput,signal?:AbortSignal) {
  const preview = await apiRequest<FinanceHistoryPreview>(`${base(context)}/history-preview`,{method:'POST',accessToken:context.accessToken,skipUnauthorizedRecovery:true,body:JSON.stringify(input),signal});
  if(!preview || preview.businessId !== context.businessId || preview.sourceNamespace !== input.sourceNamespace || !Array.isArray(preview.issues) || !Array.isArray(preview.sources)) throw new ApiResponseError();
  return preview;
}
export async function previewV2Bank(context:FinanceContext,input:FinanceBankStatementPreviewInput,signal?:AbortSignal) {
  const preview = await apiRequest<FinanceBankStatementPreview>(`${base(context)}/bank-preview`,{method:'POST',accessToken:context.accessToken,skipUnauthorizedRecovery:true,body:JSON.stringify(input),signal});
  if(!preview || preview.businessId !== context.businessId || preview.accountId !== input.accountId || !Array.isArray(preview.issues) || !Array.isArray(preview.rows)) throw new ApiResponseError();
  return preview;
}
export async function previewV2Match(context:FinanceContext,input:FinanceBankMatchPreviewInput,signal?:AbortSignal) {
  const preview = await apiRequest<FinanceBankMatchPreview>(`${base(context)}/bank-match-preview`,{method:'POST',accessToken:context.accessToken,skipUnauthorizedRecovery:true,body:JSON.stringify(input),signal});
  if(!preview || preview.businessId !== context.businessId || preview.accountId !== input.accountId || !Array.isArray(preview.staleReasons)) throw new ApiResponseError();
  return preview;
}
export async function previewV2Planning(context:FinanceContext,input:FinanceCashProjectionInput,signal?:AbortSignal) {
  const preview = await apiRequest<FinanceCashProjection>(`${base(context)}/planning-preview`,{method:'POST',accessToken:context.accessToken,skipUnauthorizedRecovery:true,body:JSON.stringify(input),signal});
  if(!preview || preview.businessId !== context.businessId || preview.currency !== 'PYG' || preview.asOf !== input.asOf || !Array.isArray(preview.events) || !Array.isArray(preview.sources) || preview.sources.length > 5000 || new Set(preview.sources.map((source)=>source?.sourceKey)).size !== preview.sources.length || preview.sources.some((source)=>!source || typeof source.sourceKey !== 'string' || !source.sourceKey || !['RECEIVABLE','PAYABLE','COMMITMENT'].includes(source.origin) || !['IN','OUT'].includes(source.direction) || !Number.isSafeInteger(source.amountMinor) || source.amountMinor <= 0 || !(source.expectedOn === null || typeof source.expectedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.expectedOn)) || !(source.accountId === null || typeof source.accountId === 'string') || typeof source.reviewRequired !== 'boolean')) throw new ApiResponseError();
  return preview;
}
