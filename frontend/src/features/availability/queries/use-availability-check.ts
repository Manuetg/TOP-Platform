import { useQuery } from "@tanstack/react-query";
import { checkAvailability } from "../api/check-availability";

interface UseAvailabilityCheckOptions {
  businessId: string;
  resourceId: string;
  from: string;
  to: string;
  accessToken?: string | null;
  enabled: boolean;
}

export function useAvailabilityCheck({
  businessId,
  resourceId,
  from,
  to,
  accessToken,
  enabled,
}: UseAvailabilityCheckOptions) {
  return useQuery({
    queryKey: [
      "availability",
      "check",
      businessId,
      resourceId,
      from,
      to,
    ],
    queryFn: () =>
      checkAvailability({
        businessId,
        resourceId,
        from,
        to,
        accessToken,
      }),
    enabled:
      enabled &&
      businessId.length > 0 &&
      resourceId.length > 0 &&
      from.length > 0 &&
      to.length > 0,
  });
}