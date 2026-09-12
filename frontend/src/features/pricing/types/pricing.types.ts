export type RatePlanStatus =
  | "ACTIVE"
  | "ARCHIVED";

export interface RatePlanResource {
  id: string;
  name: string;
  internalCode: string;
}

export interface RatePlan {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  baseNightlyAmountMinor: number;
  currency: string;
  status: RatePlanStatus;
  validFrom: string | null;
  validTo: string | null;
  resources: RatePlanResource[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateRatePlanInput {
  name: string;
  description?: string | null;
  baseNightlyAmountMinor: number;
  validFrom?: string;
  validTo?: string;
  resourceIds: string[];
}
export interface UpdateRatePlanInput {
  name?: string;
  description?: string | null;
  baseNightlyAmountMinor?: number;
  validFrom?: string | null;
  validTo?: string | null;
  resourceIds?: string[];
}
export interface SeasonalRate {
  id: string;
  ratePlanId: string;
  name: string;
  amountMinor: number;
  currency: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSeasonalRateInput {
  name: string;
  amountMinor: number;
  startDate: string;
  endDate: string;
}
export interface CalculatePriceInput {
  resourceId: string;
  checkIn: string;
  checkOut: string;
}

export type NightlyPriceSource =
  | "BASE"
  | "SEASONAL";

export interface NightlyPriceBreakdown {
  date: string;
  amountMinor: number;
  source: NightlyPriceSource;
  seasonalRateId?: string;
  seasonalRateName?: string;
}

export interface CalculatePriceResult {
  businessId: string;
  resourceId: string;
  ratePlanId: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  baseNightlyAmountMinor: number;
  totalAmountMinor: number;
  breakdown: NightlyPriceBreakdown[];
}