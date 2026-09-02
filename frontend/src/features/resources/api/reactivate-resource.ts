import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

interface ReactivateResourceOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
}

export function reactivateResource({
  businessId,
  resourceId,
  accessToken,
}: ReactivateResourceOptions): Promise<Resource> {
  return apiRequest<Resource>(
    `/businesses/${businessId}/resources/${resourceId}/reactivate`,
    {
      method: "PATCH",
      accessToken,
    },
  );
}
