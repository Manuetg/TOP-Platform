import { apiRequest } from "../../../shared/api/api-client";
import type { PaymentHistoryPage } from "../types/payment.types";

interface Options {
  businessId: string;
  bookingId: string;
  cursor?: string | null;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function listPayments({ businessId, bookingId, cursor, accessToken, signal }: Options) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return apiRequest<PaymentHistoryPage>(
    `/businesses/${encodeURIComponent(businessId)}/bookings/${encodeURIComponent(bookingId)}/payments?${query.toString()}`,
    { method: "GET", accessToken, signal },
  );
}
