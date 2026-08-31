import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

export interface UpdateResourceInput {
  name?: string;
  internalCode?: string;
  description?: string | null;
  capacityMinimum?: number;
  capacityMaximum?: number;
  capacityMaximumChildren?: number;
  sortOrder?: number;
}

interface UpdateResourceOptions {
  businessId: string;
  resourceId: string;
  accessToken?: string | null;
  input: UpdateResourceInput;
}

export function updateResource({
  businessId,
  resourceId,
  accessToken,
  input,
}: UpdateResourceOptions): Promise<Resource> {
  return apiRequest<Resource>(
    `/businesses/${businessId}/resources/${resourceId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}
