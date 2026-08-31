import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

interface GetResourceOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
}

export function getResource({
  businessId,
  resourceId,
  accessToken,
}: GetResourceOptions): Promise<Resource> {
  return apiRequest<Resource>(
    `/businesses/${businessId}/resources/${resourceId}`,
    {
      method: "GET",
      accessToken,
    },
  );
}
