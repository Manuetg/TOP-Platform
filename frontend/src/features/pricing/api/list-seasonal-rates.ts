import { apiRequest } from "../../../shared/api/api-client";
import type { SeasonalRate } from "../types/pricing.types";

interface ListSeasonalRatesOptions {
  businessId: string;
  ratePlanId: string;
  accessToken?: string | null;
}

export function listSeasonalRates({
  businessId,
  ratePlanId,
  accessToken,
}: ListSeasonalRatesOptions): Promise<SeasonalRate[]> {
  return apiRequest<SeasonalRate[]>(
    `/businesses/${businessId}/rate-plans/${ratePlanId}/seasonal-rates`,
    {
      accessToken,
    },
  );
}