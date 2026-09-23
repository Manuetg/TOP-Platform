import { apiRequest } from "../../../shared/api/api-client";
import type { RatePlan } from "../types/pricing.types";

interface ListSelectableRatePlansOptions {
  businessId: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function listSelectableRatePlans({
  businessId,
  resourceId,
  checkIn,
  checkOut,
  accessToken,
  signal,
}: ListSelectableRatePlansOptions): Promise<RatePlan[]> {
  const params = new URLSearchParams({
    resourceId,
    checkIn,
    checkOut,
  });

  return apiRequest<RatePlan[]>(
    `/businesses/${businessId}/rate-plans?${params.toString()}`,
    {
      accessToken,
      signal,
    },
  );
}