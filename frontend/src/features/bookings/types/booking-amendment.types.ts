import type { BookingStatus, ConfirmBookingPricingItem } from "./booking.types";
import type { NightlyPriceBreakdown } from "../../pricing/types/pricing.types";

export interface BookingAmendmentInput {
  contactId?: string;
  checkInDate?: string;
  checkOutDate?: string;
  adults?: number | null;
  children?: number | null;
  notes?: string | null;
  pricing?: ConfirmBookingPricingItem[];
  reason?: string;
}

export interface AgreedPricingItem {
  resourceId: string;
  ratePlanId: string | null;
  pricingMode: "CALCULATED" | "MANUAL_OVERRIDE" | "MANUAL_NO_RATE_PLAN";
  suggestedAmountMinor: number | null;
  agreedAmountMinor: number;
  adjustmentAmountMinor: number | null;
  overrideReason: string | null;
  nights: number;
  breakdown: NightlyPriceBreakdown[];
}

export interface AmendmentQuote {
  currency: string;
  totalAmountMinor: number;
  items: AgreedPricingItem[];
  fingerprint: string;
}

export interface BookingAmendmentPreview {
  bookingId: string;
  status: BookingStatus;
  expectedUpdatedAt: string;
  currentPricingId: string;
  expectedPaidAmountMinor: number;
  expectedFinancialVersion: number;
  currentPricing: {
    id: string;
    originalSnapshotId: string;
    pricingRevisionId: string | null;
    revisionNumber: number;
    businessId: string;
    bookingId: string;
    currency: string;
    totalAmountMinor: number;
    items: AgreedPricingItem[];
    createdAt: string;
  };
  quote: AmendmentQuote;
  financialSummary: { totalAmountMinor: number; paidAmountMinor: number; financialVersion: number; outstandingAmountMinor: number; creditAmountMinor: number };
  warnings: string[];
}

export interface SaveBookingAmendmentInput extends BookingAmendmentInput {
  expectedUpdatedAt: string;
  currentPricingId: string;
  expectedPaidAmountMinor: number;
  expectedFinancialVersion: number;
  acceptedQuote: AmendmentQuote;
}
