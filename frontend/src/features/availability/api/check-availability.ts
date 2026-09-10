import { apiRequest } from "../../../shared/api/api-client";
import type { AvailabilityResult } from "../types/availability.types";

interface CheckAvailabilityOptions {
  businessId: string;
  resourceId: string;
  from: string;
  to: string;
  accessToken?: string | null;
}

export function checkAvailability({
  businessId,
  resourceId,
  from,
  to,
  accessToken,
}: CheckAvailabilityOptions): Promise<AvailabilityResult> {
  const params = new URLSearchParams({
    resourceId,
    from,
    to,
  });

  return apiRequest<AvailabilityResult>(
    `/businesses/${businessId}/availability?${params.toString()}`,
    {
      method: "GET",
      accessToken,
    },
  );
}