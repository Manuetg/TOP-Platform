import { useQuery } from "@tanstack/react-query";
import {
  listRatePlans,
  type ListRatePlansOptions,
} from "../api/list-rate-plans";

export function useRatePlans(input: ListRatePlansOptions) {
  return useQuery({
    queryKey: ["rate-plans", input.businessId],
    queryFn: () => listRatePlans(input),
    enabled: Boolean(input.businessId && input.accessToken),
  });
}
