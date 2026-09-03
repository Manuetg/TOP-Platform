import { useQuery } from "@tanstack/react-query";
import { listAmenities } from "../api/list-amenities";

interface UseAmenitiesOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useAmenities({
  businessId,
  accessToken,
}: UseAmenitiesOptions) {
  return useQuery({
    queryKey: ["amenities", businessId],
    queryFn: () =>
      listAmenities({
        businessId,
        accessToken,
      }),
    enabled: Boolean(businessId && accessToken),
  });
}