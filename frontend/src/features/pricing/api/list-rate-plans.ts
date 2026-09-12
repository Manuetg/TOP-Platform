import { apiRequest } from "../../../shared/api/api-client";
import type { RatePlan } from "../types/pricing.types";

interface ListRatePlansOptions {
  businessId: string;
  accessToken?: string | null;
}

export function listRatePlans({
  businessId,
  accessToken,
}: ListRatePlansOptions): Promise<RatePlan[]> {
  return apiRequest<RatePlan[]>(
    `/businesses/${businessId}/rate-plans`,
    {
      accessToken,
    },
  );
}