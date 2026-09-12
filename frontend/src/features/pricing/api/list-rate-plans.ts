import { apiRequest } from "../../../shared/api/api-client";
import type { RatePlan } from "../types/rate-plan.types";

export interface ListRatePlansOptions {
  businessId: string;
  accessToken?: string | null;
}

export function listRatePlans({
  businessId,
  accessToken,
}: ListRatePlansOptions) {
  return apiRequest<RatePlan[]>(
    `/businesses/${encodeURIComponent(businessId)}/rate-plans`,
    {
      method: "GET",
      accessToken,
    },
  );
}
