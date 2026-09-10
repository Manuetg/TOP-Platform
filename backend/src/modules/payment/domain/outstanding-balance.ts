export const OUTSTANDING_BALANCE_REPOSITORY = Symbol(
  'OUTSTANDING_BALANCE_REPOSITORY',
);

export interface OutstandingBalanceProjection {
  paymentPlanId: string | null;
  paidAmountMinor: number;
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
