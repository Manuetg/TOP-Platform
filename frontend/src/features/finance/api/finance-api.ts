import { ApiResponseError, apiRequest } from "../../../shared/api/api-client";
import type { FinanceAuditItem, FinanceCommand, FinanceExpense, FinanceQuery, FinanceReport, FinanceResult } from "../types/finance.types";

export interface FinanceContext { businessId: string; userId: string; accessToken?: string | null }
function base(context: FinanceContext) { return `/businesses/${encodeURIComponent(context.businessId)}/finance`; }
export async function getFinanceReport(context: FinanceContext, period: FinanceQuery, signal?: AbortSignal) {
  const report = await apiRequest<FinanceReport>(`${base(context)}?${new URLSearchParams({ ...period })}`, { accessToken: context.accessToken, signal });
  if (!report || report.businessId !== context.businessId || report.from !== period.from || report.to !== period.to || report.currency !== "PYG" || !Array.isArray(report.balanceSources)) throw new ApiResponseError();
  const cashFields = [report.totals?.grossRecordedAmountMinor, report.totals?.voidedAmountMinor, report.totals?.refundedAmountMinor, report.totals?.paymentNetRetainedAmountMinor];
  if (cashFields.some((value) => !validCashAmount(value)) || !validCashAmount(report.totals?.netRecordedReceiptFlowMinor, true) || !Array.isArray(report.payments) || report.payments.some((payment) => !validVersion(payment.paymentVersion) || !['RETAINED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED'].includes(payment.effectiveStatus) || [payment.grossRecordedAmountMinor, payment.voidedAmountMinor, payment.refundedAmountMinor, payment.netRetainedAmountMinor].some((value) => !validCashAmount(value)))) throw new ApiResponseError();
  return report;
}
function validCashAmount(value:unknown,signed=false) { return typeof value==='number' && Number.isSafeInteger(value) && (signed || value>=0); }
export async function getFinanceExpense(context: FinanceContext, id: string, signal?: AbortSignal) {
  const detail = await apiRequest<{ expense: FinanceExpense; audit: FinanceAuditItem[] }>(`${base(context)}/expenses/${encodeURIComponent(id)}`, { accessToken: context.accessToken, signal });
  if (!detail?.expense || detail.expense.id !== id || !validVersion(detail.expense.version) || !Array.isArray(detail.audit)) throw new ApiResponseError();
  return detail;
}
export function getFinanceAudit(context: FinanceContext, sourceType: string, sourceId: string, signal?: AbortSignal) {
  return apiRequest<FinanceAuditItem[]>(`${base(context)}/audit/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}`, { accessToken: context.accessToken, signal });
}
export async function executeFinanceCommand(context: FinanceContext, command: FinanceCommand, idempotencyKey: string) {
  const result = await apiRequest<FinanceResult>(`${base(context)}/commands`, {
    method: "POST", accessToken: context.accessToken, skipUnauthorizedRecovery: true,
    headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(command),
  });
  if (!result || typeof result.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id) || !validVersion(result.version) || result.type !== command.type) throw new ApiResponseError();
  return result;
}
function validVersion(version: unknown) { return typeof version === "number" && Number.isSafeInteger(version) && version >= 1; }
export function exportFinanceReport(context: FinanceContext, period: FinanceQuery, token: string, signal?: AbortSignal) {
  return apiRequest<string>(`${base(context)}/export?${new URLSearchParams({ ...period, token })}`, {
    accessToken: context.accessToken, responseType: "text", signal,
  });
}
