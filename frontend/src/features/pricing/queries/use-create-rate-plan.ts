import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createRatePlan } from "../api/create-rate-plan";
import type { CreateRatePlanInput } from "../types/pricing.types";

interface UseCreateRatePlanOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useCreateRatePlan({
  businessId,
  accessToken,
}: UseCreateRatePlanOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: CreateRatePlanInput,
    ) =>
      createRatePlan({
        businessId,
        input,
        accessToken,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [
          "rate-plans",
          businessId,
        ],
      });
    },
  });
}