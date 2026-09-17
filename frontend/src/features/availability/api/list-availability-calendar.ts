import { apiRequest } from "../../../shared/api/api-client";
import type { AvailabilityReason, AvailabilityStatus } from "../types/availability.types";

export interface AvailabilityCalendarDay {
  date: string;
  status: AvailabilityStatus;
  reasons: AvailabilityReason[];
}

export interface AvailabilityCalendarResource {
  resourceId: string;
  days: AvailabilityCalendarDay[];
}

export interface AvailabilityCalendarResult {
  from: string;
  to: string;
  resources: AvailabilityCalendarResource[];
}

interface ListAvailabilityCalendarOptions {
  businessId: string;
  from: string;
  to: string;
  resourceId?: string;
  accessToken?: string | null;
}

export function listAvailabilityCalendar({
  businessId,
  from,
  to,
  resourceId,
  accessToken,
}: ListAvailabilityCalendarOptions): Promise<AvailabilityCalendarResult> {
  const params = new URLSearchParams({ from, to });

  if (resourceId) {
    params.set("resourceId", resourceId);
  }

  return apiRequest<AvailabilityCalendarResult>(
    `/businesses/${businessId}/availability/calendar?${params.toString()}`,
    { accessToken },
  );
}
