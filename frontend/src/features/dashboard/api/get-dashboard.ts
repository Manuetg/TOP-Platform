import { apiRequest } from "../../../shared/api/api-client";
import type {
  DashboardRequest,
  DashboardResponse,
} from "../types/dashboard.types";

export function getBusinessDashboard({
  businessId,
  from,
  to,
  accessToken,
}: DashboardRequest) {
  const query = new URLSearchParams({ from, to });
  return apiRequest<DashboardResponse>(
    `/businesses/${encodeURIComponent(businessId)}/dashboard?${query.toString()}`,
    { method: "GET", accessToken },
  );
}
