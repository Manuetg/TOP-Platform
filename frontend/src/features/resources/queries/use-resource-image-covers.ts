import { useQuery } from "@tanstack/react-query";
import { getResourceImageCovers } from "../api/get-resource-image-covers";

interface UseResourceImageCoversOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useResourceImageCovers({
  businessId,
  accessToken,
}: UseResourceImageCoversOptions) {
  return useQuery({
    queryKey: [
      "resources",
      businessId,
      "image-covers",
    ],
    queryFn: () =>
      getResourceImageCovers({
        businessId,
        accessToken,
      }),
    enabled: businessId.length > 0,
  });
}