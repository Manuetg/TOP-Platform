import { apiRequest, ApiResponseError } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";

interface GetBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export async function getBooking({
  businessId,
  bookingId,
  accessToken,
  signal,
}: GetBookingOptions): Promise<Booking> {
  const booking = await apiRequest<Booking>(
    `/businesses/${businessId}/bookings/${bookingId}`,
    {
      accessToken,
      signal,
    },
  );
  if (!booking || booking.id !== bookingId || booking.businessId !== businessId ||
    (booking.financialSummary !== undefined && (!booking.financialSummary ||
      !Number.isSafeInteger(booking.financialSummary.financialVersion) || booking.financialSummary.financialVersion < 0))) {
    throw Object.assign(new ApiResponseError(), { message: "La reserva no contiene una versión financiera válida. Volvé a consultar sus datos." });
  }
  return booking;
}
