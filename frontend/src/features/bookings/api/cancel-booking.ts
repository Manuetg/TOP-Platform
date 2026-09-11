import { apiRequest } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";

interface CancelBookingOptions {
  businessId: string;
  bookingId: string;
  reason?: string;
  accessToken?: string | null;
}

export function cancelBooking({
  businessId,
  bookingId,
  reason,
  accessToken,
}: CancelBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: reason || undefined,
      }),
      accessToken,
    },
  );
}