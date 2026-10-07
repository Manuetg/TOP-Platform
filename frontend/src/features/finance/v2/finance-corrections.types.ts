// Contrato root: datos OWNER de correcciones. Campos económicos proceden del servidor.
export interface FinanceEffectiveAmounts {
  grossRecordedAmountMinor: number; voidedAmountMinor: number;
  refundedAmountMinor: number; netRetainedAmountMinor: number;
}
export interface FinanceCorrectionPayment extends FinanceEffectiveAmounts {
  id: string; bookingId: string; paidAt: string; paymentVersion: number;
  effectiveStatus: 'RETAINED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'VOIDED';
  voidAllowed: boolean; refundAvailableMinor: number;
  accountLink: { accountId: string; version: number } | null;
}
export interface FinanceCorrectionBooking {
  bookingId: string; label: string; status: string; bookingUpdatedAt: string;
  resourceIds: string[]; checkInDate: string | null; checkOutDate: string | null;
  pricing: {
    currentPricingId: string; originalSnapshotId: string; pricingRevisionId: string | null;
    revisionNumber: number; kind: 'SERVICE' | 'TERMINAL_FINAL_AMOUNT';
    currency: 'PYG'; totalAmountMinor: number;
  };
  financialVersion: number; amounts: FinanceEffectiveAmounts;
  outstandingMinor: number; creditMinor: number; needsReconciliation: boolean;
  canSetTerminalFinalAmount: boolean; payments: FinanceCorrectionPayment[]; warnings: string[];
}
export interface FinanceCorrectionsData {
  businessId: string; currency: 'PYG'; timeZone: string; asOf: string; token: string;
  bookings: FinanceCorrectionBooking[];
  capabilities: { voidPayment: boolean; refundPayment: boolean; terminalFinalAmount: boolean };
  sourceLimit: 5000;
}
export interface FinanceCorrectionConcurrency {
  bookingId: string; expectedBookingUpdatedAt: string; currentPricingId: string;
  expectedFinancialVersion: number; reason: string;
}
export type FinancePaymentAdjustmentCommand = FinanceCorrectionConcurrency & {
  paymentId: string; expectedPaymentVersion: number;
} & (
  | { type: 'VOID_PAYMENT' }
  | { type: 'REFUND_PAYMENT'; amountMinor: number; occurredAt: string; accountId: string; expectedAccountVersion: number; reference: string | null }
);
export interface FinanceTerminalPricingCommand extends FinanceCorrectionConcurrency {
  type: 'SET_TERMINAL_FINAL_AMOUNT'; finalAmountMinor: number;
}
export interface FinancePaymentAdjustmentResult {
  id: string; type: 'VOID_PAYMENT' | 'REFUND_PAYMENT'; version: number;
  bookingId: string; paymentId: string; currentPricingId: string;
  paymentVersion: number; financialVersion: number; amounts: FinanceEffectiveAmounts;
  applicationReversals: { installmentId: string; amountMinor: number }[];
}
