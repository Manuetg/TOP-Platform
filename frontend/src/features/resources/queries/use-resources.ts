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
    queryFn: ({ signal }) =>
      listResources({
        businessId,
        accessToken,
        signal,
      }),
    enabled: businessId.length > 0,
  });
}
