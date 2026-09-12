import { useQuery } from "@tanstack/react-query";
import { getBusinessDashboard } from "../api/get-dashboard";
import type { DashboardRequest } from "../types/dashboard.types";
import { validateDashboardPeriod } from "../period";

export function useDashboard(input: DashboardRequest) {
  return useQuery({
    queryKey: ["dashboard", input.businessId, input.from, input.to],
    queryFn: () => getBusinessDashboard(input),
    enabled: Boolean(input.businessId && input.accessToken) && !validateDashboardPeriod(input),
    // Nunca presentar datos de otra ventana mientras se carga la selección nueva.
    placeholderData: undefined,
    retry: false,
  });
}
