import { useQuery } from "@tanstack/react-query";
import { listSeasonalRates } from "../api/list-seasonal-rates";

interface UseSeasonalRatesOptions {
  businessId: string;
  ratePlanId: string;
  accessToken?: string | null;
}

export function useSeasonalRates({
  businessId,
  ratePlanId,
  accessToken,
}: UseSeasonalRatesOptions) {
  return useQuery({
    queryKey: [
      "seasonal-rates",
      businessId,
      ratePlanId,
    ],
    queryFn: () =>
      listSeasonalRates({
        businessId,
        ratePlanId,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      ratePlanId.length > 0,
  });
}