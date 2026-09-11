import { apiRequest } from "../../../shared/api/api-client";
import type {
  Booking,
  CreateBookingInput,
} from "../types/booking.types";

interface UpdateBookingOptions {
  businessId: string;
  bookingId: string;
  input: CreateBookingInput;
  accessToken?: string | null;
}

export function updateBooking({
  businessId,
  bookingId,
  input,
  accessToken,
}: UpdateBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
      accessToken,
    },
  );
}