import { ApiResponseError, apiRequest } from '../../../shared/api/api-client';
import type { FinanceContext } from '../api/finance-api';
import type { FinanceCorrectionsData, FinancePaymentAdjustmentCommand, FinancePaymentAdjustmentResult, FinanceTerminalPricingCommand, FinanceEffectiveAmounts } from './finance-corrections.types';
import { validV2Id, validV2Version } from './finance-v2-api';

export type FinanceCorrectionCommand = FinancePaymentAdjustmentCommand | FinanceTerminalPricingCommand;
export interface FinanceTerminalPricingResult {
  id: string; type: 'SET_TERMINAL_FINAL_AMOUNT'; version: number; bookingId: string;
  currentPricingId: string; pricingRevisionId: string; revisionNumber: number;
  totalAmountMinor: number; financialVersion: number; bookingUpdatedAt: string;
  amounts: FinanceEffectiveAmounts & { financialVersion: number };
}
export type FinanceCorrectionResult = FinancePaymentAdjustmentResult | FinanceTerminalPricingResult;
const base = (context: FinanceContext) => `/businesses/${encodeURIComponent(context.businessId)}/finance`;
const nonnegative = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function amountsValid(value: FinanceEffectiveAmounts | undefined) { return Boolean(value && [value.grossRecordedAmountMinor, value.voidedAmountMinor, value.refundedAmountMinor, value.netRetainedAmountMinor].every(nonnegative)); }
export async function getFinanceCorrections(context: FinanceContext, signal?: AbortSignal) {
  const result = await apiRequest<FinanceCorrectionsData>(`${base(context)}/corrections`, { accessToken: context.accessToken, signal });
  if (!result || result.businessId !== context.businessId || result.currency !== 'PYG' || typeof result.token !== 'string' || !Array.isArray(result.bookings) || !result.capabilities || result.bookings.some((booking) => !validV2Id(booking.bookingId) || !validV2Id(booking.pricing?.currentPricingId) || !nonnegative(booking.financialVersion) || !amountsValid(booking.amounts) || !Array.isArray(booking.payments) || booking.payments.some((payment) => payment.bookingId !== booking.bookingId || !validV2Id(payment.id) || !validV2Version(payment.paymentVersion) || !amountsValid(payment)))) throw new ApiResponseError();
  return result;
}
export async function executeFinanceCorrection(context: FinanceContext, command: FinanceCorrectionCommand, key: string) {
  const result = await apiRequest<FinanceCorrectionResult>(`${base(context)}/${command.type === 'SET_TERMINAL_FINAL_AMOUNT' ? 'terminal-pricing' : 'payment-adjustments'}`, { method: 'POST', accessToken: context.accessToken, skipUnauthorizedRecovery: true, headers: { 'Idempotency-Key': key }, body: JSON.stringify(command) });
  if (!result || !validV2Id(result.id) || !validV2Version(result.version) || result.type !== command.type || result.bookingId !== command.bookingId || !validV2Id(result.currentPricingId) || !nonnegative(result.financialVersion) || !amountsValid(result.amounts)) throw new ApiResponseError();
  if (command.type === 'SET_TERMINAL_FINAL_AMOUNT') {
    if (result.type !== command.type || !validV2Id(result.pricingRevisionId) || !validV2Version(result.revisionNumber) || !nonnegative(result.totalAmountMinor)) throw new ApiResponseError();
  } else if (result.type === 'SET_TERMINAL_FINAL_AMOUNT' || result.paymentId !== command.paymentId || !validV2Version(result.paymentVersion) || !Array.isArray(result.applicationReversals)) throw new ApiResponseError();
  return result;
}
