import { apiRequest } from "../../../shared/api/api-client";
import type { AvailabilityRules } from "../types/availability.types";

interface GetAvailabilityRulesOptions {
  businessId: string;
  accessToken?: string | null;
}

export function getAvailabilityRules({
  businessId,
  accessToken,
}: GetAvailabilityRulesOptions): Promise<AvailabilityRules> {
  return apiRequest<AvailabilityRules>(
    `/businesses/${businessId}/availability-rules`,
    {
      method: "GET",
      accessToken,
    },
  );
}