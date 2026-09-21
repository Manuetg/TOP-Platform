import { apiRequest } from "../../../shared/api/api-client";
import type {
  OutstandingBalance,
  Payment,
  PaymentHistoryPage,
  PaymentPlan,
  PaymentPlanInput,
  RegisterPaymentInput,
} from "../types/payment.types";

interface BookingPaymentOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function getOutstandingBalance(options: BookingPaymentOptions) {
  return apiRequest<OutstandingBalance>(
    `/businesses/${options.businessId}/bookings/${options.bookingId}/outstanding-balance`,
    { accessToken: options.accessToken },
  );
}

export function getPaymentPlan(options: BookingPaymentOptions) {
  return apiRequest<PaymentPlan>(
    `/businesses/${options.businessId}/bookings/${options.bookingId}/payment-plan`,
    { accessToken: options.accessToken },
  );
}

export function savePaymentPlan(
  options: BookingPaymentOptions & { input: PaymentPlanInput; replace: boolean },
) {
  return apiRequest<PaymentPlan>(
    `/businesses/${options.businessId}/bookings/${options.bookingId}/payment-plan`,
    {
      method: options.replace ? "PUT" : "POST",
      accessToken: options.accessToken,
      body: JSON.stringify(options.input),
    },
  );
}

export function listPayments(
  options: BookingPaymentOptions & { cursor?: string | null; limit?: number },
) {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.cursor) params.set("cursor", options.cursor);
  return apiRequest<PaymentHistoryPage>(
    `/businesses/${options.businessId}/bookings/${options.bookingId}/payments?${params.toString()}`,
    { accessToken: options.accessToken },
  );
}

export function registerPayment(
  options: BookingPaymentOptions & { input: RegisterPaymentInput; idempotencyKey: string },
) {
  return apiRequest<Payment>(
    `/businesses/${options.businessId}/bookings/${options.bookingId}/payments`,
    {
      method: "POST",
      accessToken: options.accessToken,
      headers: { "Idempotency-Key": options.idempotencyKey },
      body: JSON.stringify(options.input),
    },
  );
}
