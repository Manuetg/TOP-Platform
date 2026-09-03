import { apiRequest } from "../../../shared/api/api-client";
import type { Resource } from "../types/resource.types";

interface SetResourceAmenitiesOptions {
  businessId: string;
  resourceId: string;
  amenityIds: string[];
  accessToken?: string | null;
}

export function setResourceAmenities({
  businessId,
  resourceId,
  amenityIds,
  accessToken,
}: SetResourceAmenitiesOptions): Promise<Resource> {
  return apiRequest<Resource>(
    `/businesses/${businessId}/resources/${resourceId}/amenities`,
    {
      method: "PUT",
      accessToken,
      body: JSON.stringify({
        amenityIds,
      }),
    },
  );
}
