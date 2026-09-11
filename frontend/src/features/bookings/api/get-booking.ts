import { apiRequest } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";

interface GetBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function getBooking({
  businessId,
  bookingId,
  accessToken,
}: GetBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}`,
    {
      accessToken,
    },
  );
}