import { apiRequest } from "../../../shared/api/api-client";
import type { Booking, BookingOperation, BookingOperationInput } from "../types/booking.types";

interface Options extends BookingOperationInput {
  operation: BookingOperation;
  businessId: string;
  bookingId: string;
  accessToken: string;
  signal: AbortSignal;
}

export function operateBooking({ operation, businessId, bookingId, accessToken, signal, expectedUpdatedAt, reason }: Options): Promise<Booking> {
  return apiRequest<Booking>(`/businesses/${businessId}/bookings/${bookingId}/${operation}`, {
    method: "POST",
    accessToken,
    signal,
    body: JSON.stringify({ expectedUpdatedAt, ...(reason ? { reason } : {}) }),
  });
}
