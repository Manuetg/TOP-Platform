import { apiRequest } from "../../../shared/api/api-client";
import type { OutstandingBalance } from "../types/payment.types";

interface Options {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function getOutstandingBalance({ businessId, bookingId, accessToken, signal }: Options) {
  return apiRequest<OutstandingBalance>(
    `/businesses/${encodeURIComponent(businessId)}/bookings/${encodeURIComponent(bookingId)}/outstanding-balance`,
    { method: "GET", accessToken, signal },
  );
}
