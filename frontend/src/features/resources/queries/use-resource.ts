import { useQuery } from "@tanstack/react-query";
import { getResource } from "../api/get-resource";

interface UseResourceOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
}

export function useResource({
  businessId,
  resourceId,
  accessToken,
}: UseResourceOptions) {
  return useQuery({
    queryKey: ["resources", businessId, resourceId],
    queryFn: () =>
      getResource({
        businessId,
        resourceId,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      resourceId.length > 0,
  });
}
