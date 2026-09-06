import { apiRequest } from "../../../shared/api/api-client";

interface DeleteResourceImageOptions {
  businessId: string;
  resourceId: string;
  imageId: string;
  accessToken?: string | null;
}

export function deleteResourceImage({
  businessId,
  resourceId,
  imageId,
  accessToken,
}: DeleteResourceImageOptions): Promise<void> {
  return apiRequest<void>(
    `/businesses/${businessId}/resources/${resourceId}/images/${imageId}`,
    {
      method: "DELETE",
      accessToken,
    },
  );
}