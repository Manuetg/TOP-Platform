import type { PricingSnapshotItem } from './pricing-snapshot.repository';

export interface CurrentPricing {
  id: string;
  originalSnapshotId: string;
  pricingRevisionId: string | null;
  revisionNumber: number;
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  items: PricingSnapshotItem[];
  createdAt: Date;
}
