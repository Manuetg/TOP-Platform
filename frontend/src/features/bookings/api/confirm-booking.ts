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
  signal?: AbortSignal;
}

export function confirmBooking({
  businessId,
  bookingId,
  input,
  accessToken,
  signal,
}: ConfirmBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}/confirm`,
    {
      method: "POST",
      accessToken,
      signal,
      body: JSON.stringify(input),
    },
  );
}