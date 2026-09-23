import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

interface ListResourcesOptions {
  businessId: string;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function listResources({
  businessId,
  accessToken,
  signal,
}: ListResourcesOptions): Promise<Resource[]> {
  return apiRequest<Resource[]>(
    `/businesses/${businessId}/resources`,
    {
      method: "GET",
      accessToken,
      signal,
    },
  );
}
