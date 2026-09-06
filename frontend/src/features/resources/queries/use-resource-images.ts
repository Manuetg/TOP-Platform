import { useQuery } from "@tanstack/react-query";
import { getResourceImages } from "../api/get-resource-images";

interface UseResourceImagesOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
}

export function useResourceImages({
  businessId,
  resourceId,
  accessToken,
}: UseResourceImagesOptions) {
  return useQuery({
    queryKey: [
      "resources",
      businessId,
      resourceId,
      "images",
    ],
    queryFn: () =>
      getResourceImages({
        businessId,
        resourceId,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      resourceId.length > 0,
  });
}