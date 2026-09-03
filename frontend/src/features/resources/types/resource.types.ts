export type ResourceStatus =
  | "ACTIVE"
  | "OUT_OF_SERVICE"
  | "ARCHIVED";

export type AmenityScope =
  | "GLOBAL"
  | "BUSINESS";

export type AmenityCategory =
  | "CONNECTIVITY"
  | "CLIMATE"
  | "BATHROOM"
  | "KITCHEN"
  | "ENTERTAINMENT"
  | "OUTDOOR"
  | "PARKING"
  | "SERVICES"
  | "ACCESSIBILITY"
  | "GENERAL";

export interface ResourceAmenity {
  id: string;
  code: string;
  name: string;
  category: AmenityCategory;
  scope: AmenityScope;
}

export interface Resource {
  id: string;
  businessId: string;
  name: string;
  internalCode: string;
  description: string | null;
  capacityMinimum: number;
  capacityMaximum: number;
  capacityMaximumChildren: number;
  status: ResourceStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  amenities: ResourceAmenity[];
}
