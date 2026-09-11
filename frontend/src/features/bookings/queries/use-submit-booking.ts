import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { submitBooking } from "../api/submit-booking";

interface UseSubmitBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useSubmitBooking({
  businessId,
  bookingId,
  accessToken,
}: UseSubmitBookingOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      submitBooking({
        businessId,
        bookingId,
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