import { useQuery } from "@tanstack/react-query";
import { listRatePlans } from "../api/list-rate-plans";

interface UseRatePlansOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useRatePlans({
  businessId,
  accessToken,
}: UseRatePlansOptions) {
  return useQuery({
    queryKey: [
      "rate-plans",
      businessId,
    ],
    queryFn: () =>
      listRatePlans({
        businessId,
        accessToken,
      }),
    enabled: businessId.length > 0,
  });
}