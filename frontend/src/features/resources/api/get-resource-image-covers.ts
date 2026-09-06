import { apiRequest } from "../../../shared/api/api-client";
import type { ResourceImageCover } from "../types/resource.types";

interface GetResourceImageCoversOptions {
  businessId: string;
  accessToken?: string | null;
}

export function getResourceImageCovers({
  businessId,
  accessToken,
}: GetResourceImageCoversOptions): Promise<ResourceImageCover[]> {
  return apiRequest<ResourceImageCover[]>(
    `/businesses/${businessId}/resources/images/covers`,
    {
      method: "GET",
      accessToken,
    },
  );
}