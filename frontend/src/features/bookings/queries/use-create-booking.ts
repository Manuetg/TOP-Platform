import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createBooking } from "../api/create-booking";
import type { CreateBookingInput } from "../types/booking.types";

interface UseCreateBookingOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useCreateBooking({
  businessId,
  accessToken,
}: UseCreateBookingOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      createBooking({
        businessId,
        input,
        accessToken,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["bookings", businessId],
      });
    },
  });
}