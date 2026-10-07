import { ApiResponseError, apiRequest } from '../../../shared/api/api-client';
import type { FinanceContext } from '../api/finance-api';
import type { FinanceCloseEvent, FinanceCloseSnapshot, FinanceCloseSources, FinancePeriod } from './finance-close.types';
import type { FinanceClosePackage } from './finance-close-package.types';
import { validV2Id, validV2Version } from './finance-v2-api';

export const closeAcknowledgementKeys = ['RECOGNITION_COVERAGE', 'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS'] as const;
export type CloseAcknowledgementKey = typeof closeAcknowledgementKeys[number];
export interface FinanceCloseResult { period: FinancePeriod; event: FinanceCloseEvent; snapshot: FinanceCloseSnapshot | null }
export type FinanceCloseRequest =
  | { operation: 'CREATE_PERIOD'; command: { from: string; to: string; reason: string } }
  | { operation: 'CLOSE_PERIOD'; periodId: string; command: { expectedVersion: number; expectedSourceToken: string; reason: string; acknowledgements: Partial<Record<CloseAcknowledgementKey, string>> } }
  | { operation: 'REOPEN_PERIOD'; periodId: string; command: { expectedVersion: number; reason: string } };
const base = (context: FinanceContext) => `/businesses/${encodeURIComponent(context.businessId)}/finance/periods`;
function periodValid(period: FinancePeriod | undefined, context: FinanceContext, id?: string) { return Boolean(period && period.businessId === context.businessId && validV2Id(period.id) && (!id || period.id === id) && validV2Version(period.version) && ['OPEN', 'CLOSED'].includes(period.status)); }
function snapshotValid(snapshot: FinanceCloseSnapshot | undefined, context: FinanceContext, periodId: string, snapshotId?: string) { return Boolean(snapshot && snapshot.businessId === context.businessId && snapshot.periodId === periodId && validV2Id(snapshot.id) && (!snapshotId || snapshot.id === snapshotId) && validV2Version(snapshot.closeVersion) && typeof snapshot.payloadHash === 'string' && typeof snapshot.sourceToken === 'string' && Array.isArray(snapshot.sourceRefs) && Array.isArray(snapshot.checklist)); }
export async function getFinancePeriods(context: FinanceContext, signal?: AbortSignal) {
  const result = await apiRequest<FinancePeriod[]>(base(context), { accessToken: context.accessToken, signal });
  if (!Array.isArray(result) || result.some((period) => !periodValid(period, context))) throw new ApiResponseError(); return result;
}
export async function prepareFinanceClose(context: FinanceContext, period: FinancePeriod, signal?: AbortSignal) {
  const result = await apiRequest<FinanceCloseSources>(`${base(context)}/${encodeURIComponent(period.id)}/prepare`, { accessToken: context.accessToken, signal });
  if (!result || result.businessId !== context.businessId || result.from !== period.from || result.to !== period.to || result.timeZone !== period.timeZone || typeof result.sourceToken !== 'string' || !result.sourceToken || !Array.isArray(result.checklist) || !Array.isArray(result.sourceRefs) || !Array.isArray(result.guardedWriters)) throw new ApiResponseError(); return result;
}
export async function getFinanceCloseSnapshot(context: FinanceContext, periodId: string, snapshotId?: string, signal?: AbortSignal) {
  const query = snapshotId ? `?${new URLSearchParams({ snapshotId })}` : '';
  const result = await apiRequest<FinanceCloseSnapshot>(`${base(context)}/${encodeURIComponent(periodId)}/snapshot${query}`, { accessToken: context.accessToken, signal });
  if (!snapshotValid(result, context, periodId, snapshotId)) throw new ApiResponseError(); return result;
}
export async function getFinanceClosePackage(context: FinanceContext, periodId: string, snapshotId: string, signal?: AbortSignal) {
  const result = await apiRequest<FinanceClosePackage>(`${base(context)}/${encodeURIComponent(periodId)}/package?${new URLSearchParams({ snapshotId })}`, { accessToken: context.accessToken, signal });
  if (!result || !snapshotValid(result.snapshot, context, periodId, snapshotId) || typeof result.detailsCsv !== 'string' || !Array.isArray(result.alerts) || !result.period || result.debtBasis !== 'OBSERVED_AT_AS_OF' || result.unknownHistoricalDebt !== true) throw new ApiResponseError(); return result;
}
export async function executeFinanceClose(context: FinanceContext, request: FinanceCloseRequest, key: string): Promise<FinancePeriod | FinanceCloseResult> {
  const suffix = request.operation === 'CREATE_PERIOD' ? '' : `/${encodeURIComponent(request.periodId)}/${request.operation === 'CLOSE_PERIOD' ? 'close' : 'reopen'}`;
  const result = await apiRequest<FinancePeriod | FinanceCloseResult>(`${base(context)}${suffix}`, { method: 'POST', accessToken: context.accessToken, skipUnauthorizedRecovery: true, headers: { 'Idempotency-Key': key }, body: JSON.stringify(request.command) });
  if (request.operation === 'CREATE_PERIOD') { if (!('id' in (result ?? {})) || !periodValid(result as FinancePeriod, context) || (result as FinancePeriod).from !== request.command.from || (result as FinancePeriod).to !== request.command.to) throw new ApiResponseError(); return result; }
  if (!result || !('period' in result) || !periodValid(result.period, context, request.periodId) || result.period.status !== (request.operation === 'CLOSE_PERIOD' ? 'CLOSED' : 'OPEN') || !result.event || !validV2Id(result.event.id) || result.event.businessId !== context.businessId || result.event.periodId !== request.periodId || result.event.type !== (request.operation === 'CLOSE_PERIOD' ? 'CLOSE' : 'REOPEN') || !validV2Version(result.event.afterVersion) || result.event.afterVersion !== result.period.version || (request.operation === 'CLOSE_PERIOD' && (!snapshotValid(result.snapshot ?? undefined, context, request.periodId) || result.snapshot?.id !== result.event.snapshotId || result.snapshot?.closeVersion !== result.period.version))) throw new ApiResponseError();
  return result;
}
