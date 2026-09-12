import { apiRequest } from "../../../shared/api/api-client";
import type {
  Booking,
  ConfirmBookingInput,
} from "../types/booking.types";

interface ConfirmBookingOptions {
  businessId: string;
  bookingId: string;
  input: ConfirmBookingInput;
  accessToken?: string | null;
}

export function confirmBooking({
  businessId,
  bookingId,
  input,
  accessToken,
}: ConfirmBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}/confirm`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}