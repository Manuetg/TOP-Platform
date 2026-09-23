import { useQuery } from "@tanstack/react-query";
import { listAvailabilityCalendar } from "../api/list-availability-calendar";

interface UseAvailabilityCalendarOptions {
  businessId: string;
  from: string;
  to: string;
  resourceId?: string;
  accessToken?: string | null;
  enabled?: boolean;
}

export function useAvailabilityCalendar({
  businessId,
  from,
  to,
  resourceId,
  accessToken,
  enabled = true,
}: UseAvailabilityCalendarOptions) {
  return useQuery({
    queryKey: ["availability", "calendar", businessId, from, to, resourceId ?? ""],
    queryFn: ({ signal }) =>
      listAvailabilityCalendar({
        businessId,
        from,
        to,
        resourceId,
        accessToken,
        signal,
      }),
    enabled: enabled && businessId.length > 0 && from.length > 0 && to.length > 0,
  });
}
