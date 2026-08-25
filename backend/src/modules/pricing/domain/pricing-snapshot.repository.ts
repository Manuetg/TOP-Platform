export const PRICING_SNAPSHOT_REPOSITORY = Symbol(
  'PRICING_SNAPSHOT_REPOSITORY',
);

export type PricingMode =
  | 'CALCULATED'
  | 'MANUAL_OVERRIDE';

import type {
  NightlyPriceBreakdown,
} from './pricing-calculator';

export interface PricingSnapshotItem {
  resourceId: string;
  ratePlanId: string;
  pricingMode: PricingMode;
  suggestedAmountMinor: number;
  agreedAmountMinor: number;
  adjustmentAmountMinor: number;
  overrideReason: string | null;
  nights: number;
  breakdown: NightlyPriceBreakdown[];
}

export interface PricingSnapshot {
  id: string;
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  items: PricingSnapshotItem[];
  createdAt: Date;
}

export interface CreatePricingSnapshotData {
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  items: PricingSnapshotItem[];
}

export interface PricingSnapshotRepository {
  create(
    data: CreatePricingSnapshotData,
  ): Promise<PricingSnapshot>;

  findByBookingId(
    bookingId: string,
  ): Promise<PricingSnapshot | null>;
}