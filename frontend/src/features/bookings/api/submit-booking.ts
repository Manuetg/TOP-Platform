import { apiRequest } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";

interface SubmitBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function submitBooking({
  businessId,
  bookingId,
  accessToken,
}: SubmitBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}/submit`,
    {
      method: "POST",
      accessToken,
    },
  );
}