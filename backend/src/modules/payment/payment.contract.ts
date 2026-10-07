export interface RevenueProjectionInput {
  businessId: string;
  from: string;
  to: string;
  timeZone: string;
}

export interface RevenueAmount {
  currency: string;
  amountMinor: number;
}

export interface RevenueProjection {
  amounts: RevenueAmount[];
}

export const REVENUE_PROJECTION_READER = Symbol(
  'REVENUE_PROJECTION_READER',
);

export interface RevenueProjectionReader {
  read(input: RevenueProjectionInput): Promise<RevenueProjection>;
}
export { needsPaymentReconciliation, PAYMENT_RECONCILIATION_WARNING } from './domain/financial-reconciliation';
export { readRecordedPaymentsForFinance, type FinancePaymentSource } from './infrastructure/prisma-finance-payment.reader';
export { readPaymentAdjustmentsForFinance, type FinancePaymentAdjustmentSource } from './infrastructure/prisma-finance-payment.reader';
export { readPaymentMoneySourcesForFinance, type FinancePaymentMoneySource } from './infrastructure/prisma-finance-payment.reader';
export { readPaymentClosingSources, type PaymentClosingSources, type PaymentClosingSourceRef } from './infrastructure/prisma-payment-closing.reader';
export { appendPaymentAdjustment, type ResolveRefundAccount } from './infrastructure/prisma-payment-adjustment.writer';
export type { PaymentAdjustmentInput, PaymentAdjustmentResult, PaymentAdjustmentAmounts, RefundAccountScope } from './domain/payment-adjustment.types';
export type { EffectivePaymentHistoryItem, PublicPaymentAdjustment } from './domain/payment';
export { PaymentAdjustmentInputError, PaymentAdjustmentConflictError, PaymentAdjustmentInvariantError, PaymentAdjustmentForbiddenError, PaymentAdjustmentNotFoundError } from './domain/payment-adjustment.rules';
export { readBookingEffectiveAmounts, readEffectivePayments, type EffectiveAmountsProjection, type EffectivePaymentProjection } from './infrastructure/prisma-payment-effective.reader';
