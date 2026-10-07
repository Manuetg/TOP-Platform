import type { Booking, BookingStatus } from '../booking/booking.contract';
import type { CurrentPricing, PricingSnapshotItem } from '../pricing/pricing.contract';

export const BOOKING_AMENDMENT_TRANSACTION = Symbol('BOOKING_AMENDMENT_TRANSACTION');
export class BookingAmendmentConflictError extends Error {}
export class BookingAmendmentPermissionError extends Error {}

export interface AmendmentChanges {
  contactId?: string;
  checkInDate?: Date;
  checkOutDate?: Date;
  adults?: number | null;
  children?: number | null;
  notes?: string | null;
  pricing?: unknown;
  reason: string | null;
}

export interface AmendmentQuote {
  currency: string;
  totalAmountMinor: number;
  items: PricingSnapshotItem[];
  fingerprint: string;
}

export interface AmendmentFinancialSummary {
  totalAmountMinor: number;
  paidAmountMinor: number;
  grossRecordedAmountMinor: number;
  voidedAmountMinor: number;
  refundedAmountMinor: number;
  netRetainedAmountMinor: number;
  financialVersion: number;
  outstandingAmountMinor: number;
  creditAmountMinor: number;
}

export interface BookingAmendmentPreview {
  bookingId: string;
  status: BookingStatus;
  expectedUpdatedAt: string;
  currentPricingId: string;
  expectedPaidAmountMinor: number;
  expectedFinancialVersion: number;
  currentPricing: CurrentPricing;
  quote: AmendmentQuote;
  financialSummary: AmendmentFinancialSummary;
  warnings: string[];
}

export interface AmendmentExpectation {
  expectedUpdatedAt: string;
  currentPricingId: string;
  expectedPaidAmountMinor: number;
  expectedFinancialVersion: number;
  acceptedQuote: AmendmentQuote;
}

export interface BookingAmendmentTransactionInput {
  businessId: string;
  bookingId: string;
  actorUserId: string;
  changes: AmendmentChanges;
  preparePricing: (range: { checkInDate: Date; checkOutDate: Date }, resourceIds: string[]) => Promise<Omit<AmendmentQuote, 'fingerprint'>>;
}

export interface BookingAmendmentTransaction {
  preview(input: BookingAmendmentTransactionInput): Promise<BookingAmendmentPreview>;
  save(input: BookingAmendmentTransactionInput, expectation: AmendmentExpectation): Promise<Booking>;
}
