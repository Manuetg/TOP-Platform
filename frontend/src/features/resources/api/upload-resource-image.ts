import { apiRequest } from "../../../shared/api/api-client";
import type { ResourceImage } from "../types/resource.types";

interface UploadResourceImageOptions {
  businessId: string;
  resourceId: string;
  file: File;
  accessToken?: string | null;
}

export function uploadResourceImage({
  businessId,
  resourceId,
  file,
  accessToken,
}: UploadResourceImageOptions): Promise<ResourceImage> {
  const formData = new FormData();

  formData.append("file", file);

  return apiRequest<ResourceImage>(
    `/businesses/${businessId}/resources/${resourceId}/images`,
    {
      method: "POST",
      body: formData,
      accessToken,
    },
  );
}