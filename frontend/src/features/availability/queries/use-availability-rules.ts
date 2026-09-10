import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getAvailabilityRules } from "../api/get-availability-rules";
import { updateAvailabilityRules } from "../api/update-availability-rules";
import type { UpdateAvailabilityRulesInput } from "../types/availability.types";

interface UseAvailabilityRulesOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useAvailabilityRules({
  businessId,
  accessToken,
}: UseAvailabilityRulesOptions) {
  return useQuery({
    queryKey: [
      "availability",
      "rules",
      businessId,
    ],
    queryFn: () =>
      getAvailabilityRules({
        businessId,
        accessToken,
      }),
    enabled: businessId.length > 0,
  });
}

export function useUpdateAvailabilityRules({
  businessId,
  accessToken,
}: UseAvailabilityRulesOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      input: UpdateAvailabilityRulesInput,
    ) =>
      updateAvailabilityRules({
        businessId,
        input,
        accessToken,
      }),

    onSuccess: (rules) => {
      queryClient.setQueryData(
        [
          "availability",
          "rules",
          businessId,
        ],
        rules,
      );
    },
  });
}