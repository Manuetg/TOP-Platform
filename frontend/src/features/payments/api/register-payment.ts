import { apiRequest } from "../../../shared/api/api-client";
import type { PaymentHistoryItem, RegisterPaymentPayload } from "../types/payment.types";

interface Options { businessId: string; bookingId: string; accessToken?: string | null; idempotencyKey: string; payload: RegisterPaymentPayload; signal?: AbortSignal; }
export function registerPayment({ businessId, bookingId, accessToken, idempotencyKey, payload, signal }: Options) {
  return apiRequest<PaymentHistoryItem>(`/businesses/${encodeURIComponent(businessId)}/bookings/${encodeURIComponent(bookingId)}/payments`, { method: "POST", accessToken, headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(payload), signal });
}
