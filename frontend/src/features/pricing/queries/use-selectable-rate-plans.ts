import { useQuery } from "@tanstack/react-query";
import { listSelectableRatePlans } from "../api/list-selectable-rate-plans";

interface UseSelectableRatePlansOptions {
  businessId: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
  accessToken?: string | null;
}

export function useSelectableRatePlans({
  businessId,
  resourceId,
  checkIn,
  checkOut,
  accessToken,
}: UseSelectableRatePlansOptions) {
  return useQuery({
    queryKey: [
      "rate-plans",
      "selectable",
      businessId,
      resourceId,
      checkIn,
      checkOut,
    ],
    queryFn: () =>
      listSelectableRatePlans({
        businessId,
        resourceId,
        checkIn,
        checkOut,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      resourceId.length > 0 &&
      checkIn.length > 0 &&
      checkOut.length > 0,
  });
}