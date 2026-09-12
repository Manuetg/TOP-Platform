import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { updateRatePlan } from "../api/update-rate-plan";
import type { UpdateRatePlanInput } from "../types/pricing.types";

interface UseUpdateRatePlanOptions {
  businessId: string;
  ratePlanId: string;
  accessToken?: string | null;
}

export function useUpdateRatePlan({
  businessId,
  ratePlanId,
  accessToken,
}: UseUpdateRatePlanOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: UpdateRatePlanInput,
    ) =>
      updateRatePlan({
        businessId,
        ratePlanId,
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