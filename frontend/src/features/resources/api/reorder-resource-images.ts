import { apiRequest } from "../../../shared/api/api-client";

interface ReorderResourceImagesOptions {
  businessId: string;
  resourceId: string;
  imageIds: string[];
  accessToken?: string | null;
}

export function reorderResourceImages({
  businessId,
  resourceId,
  imageIds,
  accessToken,
}: ReorderResourceImagesOptions): Promise<void> {
  return apiRequest<void>(
    `/businesses/${businessId}/resources/${resourceId}/images/order`,
    {
      method: "PUT",
      body: JSON.stringify({ imageIds }),
      accessToken,
    },
  );
}