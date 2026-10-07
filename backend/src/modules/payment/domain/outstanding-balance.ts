export const OUTSTANDING_BALANCE_REPOSITORY = Symbol(
  'OUTSTANDING_BALANCE_REPOSITORY',
);

export interface OutstandingBalanceProjection {
  currentCurrency?: string;
  currentTotalAmountMinor?: number;
  currentPricingRevisionId?: string | null;
  paymentPlanId: string | null;
  planCurrency?: string | null;
  paymentCurrencyMismatch?: boolean;
  invalidMonetaryData?: boolean;
  paidAmountMinor: number;
  grossRecordedAmountMinor: number;
  voidedAmountMinor: number;
  refundedAmountMinor: number;
  netRetainedAmountMinor: number;
  financialVersion: number;
  planTotalAmountMinor: number | null;
  installmentTotalAmountMinor: number;
  appliedAmountMinor: number;
  overdueAmountMinor: number;
  nextDueDate: Date | null;
  nextDueAmountMinor: number | null;
}

export interface OutstandingBalanceRepository {
  calculate(input: {
    businessId: string;
    bookingId: string;
    businessLocalDate: string;
  }): Promise<OutstandingBalanceProjection>;
}
