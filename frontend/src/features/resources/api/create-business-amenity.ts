import { apiRequest } from "../../../shared/api/api-client";
import type { Amenity } from "./list-amenities";
import type { AmenityCategory } from "../types/resource.types";

interface CreateBusinessAmenityOptions {
  businessId: string;
  name: string;
  category: AmenityCategory;
  accessToken?: string | null;
}

export function createBusinessAmenity({
  businessId,
  name,
  category,
  accessToken,
}: CreateBusinessAmenityOptions): Promise<Amenity> {
  return apiRequest<Amenity>(
    `/businesses/${businessId}/amenities`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        name,
        category,
      }),
    },
  );
}