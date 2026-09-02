import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

interface DisableResourceOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
}

export function disableResource({
  businessId,
  resourceId,
  accessToken,
}: DisableResourceOptions): Promise<Resource> {
  return apiRequest<Resource>(
    `/businesses/${businessId}/resources/${resourceId}/disable`,
    {
      method: "PATCH",
      accessToken,
    },
  );
}
