import { apiRequest } from "../../../shared/api/api-client";
import type {
  Booking,
  CreateBookingInput,
} from "../types/booking.types";

interface CreateBookingOptions {
  businessId: string;
  input: CreateBookingInput;
  accessToken?: string | null;
}

export function createBooking({
  businessId,
  input,
  accessToken,
}: CreateBookingOptions): Promise<Booking> {
  return apiRequest<Booking>(
    `/businesses/${businessId}/bookings`,
    {
      method: "POST",
      body: JSON.stringify(input),
      accessToken,
    },
  );
}