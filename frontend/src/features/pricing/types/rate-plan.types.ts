export interface RatePlan {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  baseNightlyAmountMinor: number;
  currency: string;
  status: "ACTIVE" | "ARCHIVED";
  validFrom: string | null;
  validTo: string | null;
  resources: Array<{ id: string; name: string; internalCode: string }>;
  createdAt: string;
  updatedAt: string;
}
