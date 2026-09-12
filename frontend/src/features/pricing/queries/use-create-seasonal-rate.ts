import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createSeasonalRate } from "../api/create-seasonal-rate";
import type { CreateSeasonalRateInput } from "../types/pricing.types";

interface UseCreateSeasonalRateOptions {
  businessId: string;
  ratePlanId: string;
  accessToken?: string | null;
}

export function useCreateSeasonalRate({
  businessId,
  ratePlanId,
  accessToken,
}: UseCreateSeasonalRateOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: CreateSeasonalRateInput,
    ) =>
      createSeasonalRate({
        businessId,
        ratePlanId,
        input,
        accessToken,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "seasonal-rates",
          businessId,
          ratePlanId,
        ],
      });
    },
  });
}