import { useQuery } from "@tanstack/react-query";
import { getBooking } from "../api/get-booking";

interface UseBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useBooking({
  businessId,
  bookingId,
  accessToken,
}: UseBookingOptions) {
  return useQuery({
    queryKey: ["bookings", businessId, bookingId],
    queryFn: () =>
      getBooking({
        businessId,
        bookingId,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      bookingId.length > 0,
  });
}