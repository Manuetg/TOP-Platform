import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { cancelBooking } from "../api/cancel-booking";

interface UseCancelBookingOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useCancelBooking({
  businessId,
  bookingId,
  accessToken,
}: UseCancelBookingOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason?: string) =>
      cancelBooking({
        businessId,
        bookingId,
        reason,
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