export type ResourceStatus =
  | "ACTIVE"
  | "OUT_OF_SERVICE"
  | "ARCHIVED";

export interface ResourceAmenity {
  id: string;
  code: string;
  name: string;
  category: string;
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
