import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

export interface CreateResourceInput {
  name: string;
  internalCode: string;
  description?: string | null;
  capacityMinimum?: number;
  capacityMaximum: number;
  capacityMaximumChildren?: number;
  sortOrder?: number;
}

interface CreateResourceOptions {
  businessId: string;
  accessToken?: string | null;
  input: CreateResourceInput;
}

export function createResource({
  businessId,
  accessToken,
  input,
}: CreateResourceOptions): Promise<Resource> {
  return apiRequest<Resource>(
    `/businesses/${businessId}/resources`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}
