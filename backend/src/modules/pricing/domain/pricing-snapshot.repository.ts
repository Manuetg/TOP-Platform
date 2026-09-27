export const PRICING_SNAPSHOT_REPOSITORY = Symbol(
  'PRICING_SNAPSHOT_REPOSITORY',
);

export type PricingMode =
  | 'CALCULATED'
  | 'MANUAL_OVERRIDE'
  | 'MANUAL_NO_RATE_PLAN';

import type {
  NightlyPriceBreakdown,
} from './pricing-calculator';

interface PricingSnapshotItemBase {
  resourceId: string;
  agreedAmountMinor: number;
  overrideReason: string | null;
  nights: number;
  breakdown: NightlyPriceBreakdown[];
}

export interface ReferencedPricingSnapshotItem extends PricingSnapshotItemBase {
  ratePlanId: string;
  pricingMode: 'CALCULATED' | 'MANUAL_OVERRIDE';
  suggestedAmountMinor: number;
  adjustmentAmountMinor: number;
}

export interface ManualPricingSnapshotItem extends PricingSnapshotItemBase {
  ratePlanId: null;
  pricingMode: 'MANUAL_NO_RATE_PLAN';
  suggestedAmountMinor: null;
  adjustmentAmountMinor: null;
  overrideReason: string;
  breakdown: [];
}

export type PricingSnapshotItem = ReferencedPricingSnapshotItem | ManualPricingSnapshotItem;

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