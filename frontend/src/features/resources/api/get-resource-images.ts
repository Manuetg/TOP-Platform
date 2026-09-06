import { apiRequest } from "../../../shared/api/api-client";
import type { ResourceImage } from "../types/resource.types";

interface GetResourceImagesOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
}

export function getResourceImages({
  businessId,
  resourceId,
  accessToken,
}: GetResourceImagesOptions): Promise<ResourceImage[]> {
  return apiRequest<ResourceImage[]>(
    `/businesses/${businessId}/resources/${resourceId}/images`,
    {
      method: "GET",
      accessToken,
    },
  );
}