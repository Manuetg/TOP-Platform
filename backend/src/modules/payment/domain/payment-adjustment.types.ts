export interface PaymentAdjustmentExpectation {
  businessId: string;
  bookingId: string;
  paymentId: string;
  actorUserId: string;
  requestId: string;
  reason: string;
  expectedBookingUpdatedAt: string;
  currentPricingId: string;
  expectedPaymentVersion: number;
  expectedFinancialVersion: number;
}

export type PaymentAdjustmentInput = PaymentAdjustmentExpectation & (
  | { kind: 'VOID' }
  | { kind: 'REFUND'; amountMinor: number; occurredAt: string; accountId: string; expectedAccountVersion: number; reference: string | null }
);

export interface RefundAccountScope {
  accountId: string;
  accountVersion: number;
  openingId: string;
  openingOccurredAt: Date;
}

export interface PaymentAdjustmentAmounts {
  grossRecordedAmountMinor: number;
  voidedAmountMinor: number;
  refundedAmountMinor: number;
  netRetainedAmountMinor: number;
}

export interface PaymentAdjustmentResult {
  id: string;
  type: 'VOID_PAYMENT' | 'REFUND_PAYMENT';
  version: number;
  bookingId: string;
  paymentId: string;
  currentPricingId: string;
  paymentVersion: number;
  financialVersion: number;
  amounts: PaymentAdjustmentAmounts;
  applicationReversals: { installmentId: string; amountMinor: number }[];
}
