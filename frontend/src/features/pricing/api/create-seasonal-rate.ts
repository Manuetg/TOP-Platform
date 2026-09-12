import { apiRequest } from "../../../shared/api/api-client";
import type {
  CreateSeasonalRateInput,
  SeasonalRate,
} from "../types/pricing.types";

interface CreateSeasonalRateOptions {
  businessId: string;
  ratePlanId: string;
  input: CreateSeasonalRateInput;
  accessToken?: string | null;
}

export function createSeasonalRate({
  businessId,
  ratePlanId,
  input,
  accessToken,
}: CreateSeasonalRateOptions): Promise<SeasonalRate> {
  return apiRequest<SeasonalRate>(
    `/businesses/${businessId}/rate-plans/${ratePlanId}/seasonal-rates`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}