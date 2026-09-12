import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { confirmBooking } from "../api/confirm-booking";
import type { ConfirmBookingInput } from "../types/booking.types";

interface UseConfirmBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useConfirmBooking({
  businessId,
  bookingId,
  accessToken,
}: UseConfirmBookingOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: ConfirmBookingInput,
    ) =>
      confirmBooking({
        businessId,
        bookingId,
        input,
        accessToken,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "booking",
            businessId,
            bookingId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "bookings",
            businessId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "booking-timeline",
            businessId,
            bookingId,
          ],
        }),
      ]);
    },
  });
}