import { apiRequest } from "../../../shared/api/api-client";
import type { Booking, CreatePendingBookingInput } from "../types/booking.types";

interface Options {
  businessId: string;
  input: CreatePendingBookingInput;
  accessToken?: string | null;
  signal?: AbortSignal;
}

/** Guarda datos y precio juntos; el estado Pendiente lo determina el servidor. */
export function createPendingBooking({ businessId, input, accessToken, signal }: Options): Promise<Booking> {
  return apiRequest<Booking>(`/businesses/${businessId}/bookings/pending`, {
    method: "POST",
    body: JSON.stringify(input),
    accessToken,
    signal,
  });
}
