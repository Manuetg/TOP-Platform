import { ApiResponseError, apiRequest } from '../../../shared/api/api-client';
import type { FinanceContext } from '../api/finance-api';
import type { CertifyServiceCommand, ServiceCertificate } from './finance-recognition.types';
import type { FinanceRecognitionSourceReport, FinanceTerminalRecognitionCommand, FinanceTerminalRecognitionResult } from './finance-recognition-ui.types';
import { validV2Id, validV2Version } from './finance-v2-api';

export type FinanceRecognitionRequest = { operation: 'CERTIFY_SERVICE'; command: CertifyServiceCommand } | { operation: 'RECOGNIZE_TERMINAL'; command: FinanceTerminalRecognitionCommand };
const base = (context: FinanceContext) => `/businesses/${encodeURIComponent(context.businessId)}/finance`;
export async function getFinanceRecognitionSources(context: FinanceContext, period: { from: string; to: string }, signal?: AbortSignal) {
  const result = await apiRequest<FinanceRecognitionSourceReport>(`${base(context)}/recognition-sources?${new URLSearchParams(period)}`, { accessToken: context.accessToken, signal });
  if (!result || result.businessId !== context.businessId || result.from !== period.from || result.to !== period.to || typeof result.token !== 'string' || !Array.isArray(result.sources) || result.sources.some((source) => !validV2Id(source.bookingId) || typeof source.bookingUpdatedAt !== 'string' || !Array.isArray(source.eligibleNights) || !Array.isArray(source.certificationBlockers) || (source.currentCertificate && (source.currentCertificate.businessId !== context.businessId || source.currentCertificate.bookingId !== source.bookingId || !validV2Version(source.currentCertificate.version))))) throw new ApiResponseError(); return result;
}
export async function executeFinanceRecognition(context: FinanceContext, request: FinanceRecognitionRequest, key: string): Promise<ServiceCertificate | FinanceTerminalRecognitionResult> {
  const result = await apiRequest<ServiceCertificate | FinanceTerminalRecognitionResult>(`${base(context)}/${request.operation === 'CERTIFY_SERVICE' ? 'service-certificates' : 'terminal-recognitions'}`, { method: 'POST', accessToken: context.accessToken, skipUnauthorizedRecovery: true, headers: { 'Idempotency-Key': key }, body: JSON.stringify(request.command) });
  if (!result || result.businessId !== context.businessId || result.bookingId !== request.command.bookingId || !validV2Id(result.id) || !validV2Version(result.version)) throw new ApiResponseError();
  if (request.operation === 'CERTIFY_SERVICE') { if (!('units' in result) || !Array.isArray(result.units) || result.servicePolicyVersion !== 'NIGHT_SERVICE_V1') throw new ApiResponseError(); }
  else if (!('pricingRevisionId' in result) || result.pricingRevisionId !== request.command.expectedPricingRevisionId || !Number.isSafeInteger(result.amountMinor) || !Number.isSafeInteger(result.finalAmountMinor)) throw new ApiResponseError(); return result;
}
