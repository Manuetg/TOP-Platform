export {
  PRICING_SNAPSHOT_REPOSITORY,
  type PricingSnapshot,
  type PricingSnapshotRepository,
} from './domain/pricing-snapshot.repository';

export interface PricingQuoteInput {
  businessId: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
}

export interface PricingQuoteResult {
  businessId: string;
  resourceId: string;
  ratePlanId: string;
  ratePlanName: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmountMinor: number;
}

export interface PricingQuote {
  quote(input: PricingQuoteInput): Promise<PricingQuoteResult | null>;
}

export const PRICING_QUOTE = Symbol('PRICING_QUOTE');
