import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { updateBooking } from "../api/update-booking";
import type { CreateBookingInput } from "../types/booking.types";

interface UseUpdateBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useUpdateBooking({
  businessId,
  bookingId,
  accessToken,
}: UseUpdateBookingOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: CreateBookingInput,
    ) =>
      updateBooking({
        businessId,
        bookingId,
        input,
        accessToken,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "bookings",
            businessId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "bookings",
            businessId,
            bookingId,
          ],
        }),
      ]);
    },
  });
}