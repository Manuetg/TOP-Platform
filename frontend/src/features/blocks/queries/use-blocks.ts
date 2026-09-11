import { useQuery } from "@tanstack/react-query";
import { listBlocks } from "../api/list-blocks";

interface UseBlocksOptions {
  businessId: string;
  resourceId?: string;
  from?: string;
  to?: string;
  accessToken?: string | null;
  enabled?: boolean;
}

export function useBlocks({
  businessId,
  resourceId,
  from,
  to,
  accessToken,
  enabled = true,
}: UseBlocksOptions) {
  return useQuery({
    queryKey: [
      "blocks",
      businessId,
      resourceId ?? "",
      from ?? "",
      to ?? "",
    ],
    queryFn: () =>
      listBlocks({
        businessId,
        resourceId,
        from,
        to,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      enabled,
  });
}