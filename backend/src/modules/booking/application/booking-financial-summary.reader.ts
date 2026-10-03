export const BOOKING_FINANCIAL_SUMMARY_READER = Symbol('BOOKING_FINANCIAL_SUMMARY_READER');
export interface BookingFinancialSummary {
  totalAmountMinor: number | null;
  paidAmountMinor: number;
  outstandingAmountMinor: number;
  creditAmountMinor: number;
  currency: string | null;
  /** Internal projection field; never included in financialSummary's public JSON. */
  bookingStatus?: BookingStatus;
}
export interface BookingFinancialSummaryReader {
  read(businessId: string, bookingIds: string[]): Promise<Map<string, BookingFinancialSummary>>;
}
import type { BookingStatus } from '../domain/booking-status.enum';
