import { apiRequest } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";

interface GetBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function getBooking({
  businessId,
  bookingId,
  accessToken,
  signal,
}: GetBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}`,
    {
      accessToken,
      signal,
    },
  );
}
