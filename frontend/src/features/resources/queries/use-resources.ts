import { useQuery } from "@tanstack/react-query";
import { listResources } from "../api/list-resources";

interface UseResourcesOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useResources({
  businessId,
  accessToken,
}: UseResourcesOptions) {
  return useQuery({
    queryKey: ["resources", businessId],
    queryFn: () =>
      listResources({
        businessId,
        accessToken,
      }),
    enabled: businessId.length > 0,
  });
}
