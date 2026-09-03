import { apiRequest } from "../../../shared/api/api-client";
import type { AmenityCategory, AmenityScope } from "../types/resource.types";

export interface Amenity {
  id: string;
  code: string;
  name: string;
  category: AmenityCategory;
  sortOrder: number;
  scope: AmenityScope;
}

interface ListAmenitiesOptions {
  businessId: string;
  accessToken?: string | null;
}

export function listAmenities({
  businessId,
  accessToken,
}: ListAmenitiesOptions): Promise<Amenity[]> {
  return apiRequest<Amenity[]>(
    `/businesses/${businessId}/amenities`,
    {
      method: "GET",
      accessToken,
    },
  );
}