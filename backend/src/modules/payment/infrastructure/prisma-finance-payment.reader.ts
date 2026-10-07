import type { Prisma } from '@prisma/client';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';

export interface FinancePaymentSource {
  id: string;
  bookingId: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
  reference: string | null;
  paymentVersion: number;
}

/** Payment owns these immutable facts; Finance only assigns an informational account. */
export async function readRecordedPaymentsForFinance(
  transaction: Prisma.TransactionClient,
  businessId: string,
): Promise<FinancePaymentSource[]> {
  const rows = await transaction.payment.findMany({
    where: { businessId, status: 'RECORDED' },
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    take: 5001,
    select: { id: true, bookingId: true, amountMinor: true, currency: true, paidAt: true, reference: true },
  });
  const states = await transaction.$queryRaw<{ paymentId: string; paymentVersion: bigint; invalidMonetaryData: boolean }[]>`
    SELECT "paymentId", "paymentVersion", "invalidMonetaryData" FROM "PaymentEffectiveState" WHERE "businessId" = ${businessId} AND "paymentId" = ANY(${rows.map((row) => row.id)}::text[])
  `;
  const versions = new Map(states.map((state) => [state.paymentId, state]));
  return rows.map((row) => {
    const state = versions.get(row.id);
    if (!state || state.invalidMonetaryData || state.paymentVersion < 1n) throw new Error('FINANCE_PAYMENT_EFFECTIVE_INVARIANT');
    return { ...row, amountMinor: fromPrismaMoney(row.amountMinor), paidAt: row.paidAt.toISOString(), paymentVersion: fromPrismaMoney(state.paymentVersion) };
  });
}

export interface FinancePaymentAdjustmentSource {
  id: string;
  paymentId: string;
  bookingId: string;
  kind: 'VOID' | 'REFUND';
  amountMinor: number;
  currency: string;
  occurredAt: string;
  createdAt: string;
  accountId: string | null;
  sequence: number;
}

/** Finance derives one correction/outflow per immutable adjustment, without a CashMovement. */
export async function readPaymentAdjustmentsForFinance(transaction: Prisma.TransactionClient, businessId: string): Promise<FinancePaymentAdjustmentSource[]> {
  const rows = await transaction.paymentAdjustment.findMany({ where: { businessId }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 5001, select: { id: true, paymentId: true, bookingId: true, kind: true, amountMinor: true, currency: true, occurredAt: true, createdAt: true, accountId: true, sequence: true } });
  return rows.map((row) => {
    if (!['VOID', 'REFUND'].includes(row.kind) || row.currency !== 'PYG' || row.amountMinor <= 0n || !Number.isSafeInteger(row.sequence) || row.sequence < 1 || (row.kind === 'VOID' && row.accountId !== null) || (row.kind === 'REFUND' && row.accountId === null)) throw new Error('FINANCE_PAYMENT_ADJUSTMENT_INVARIANT');
    return { ...row, kind: row.kind as 'VOID' | 'REFUND', amountMinor: fromPrismaMoney(row.amountMinor), occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString() };
  });
}

export interface FinancePaymentMoneySource {
  sourceType: 'PAYMENT' | 'REFUND';
  sourceId: string;
  paymentId: string;
  bookingId: string;
  paymentVersion: number;
  version: number;
  amountMinorSigned: number;
  currency: string;
  occurredAt: string;
  accountId: string | null;
  reference: string | null;
}

/** Bank matching uses recorded receipts and actual refunds; a void has no bank movement. */
export async function readPaymentMoneySourcesForFinance(transaction: Prisma.TransactionClient, businessId: string): Promise<FinancePaymentMoneySource[]> {
  const [payments, adjustments] = await Promise.all([readRecordedPaymentsForFinance(transaction, businessId), readPaymentAdjustmentsForFinance(transaction, businessId)]);
  const originals = new Map(payments.map((payment) => [payment.id, payment]));
  const voided = new Set(adjustments.filter((adjustment) => adjustment.kind === 'VOID').map((adjustment) => adjustment.paymentId));
  const receipts: FinancePaymentMoneySource[] = payments.filter((payment) => !voided.has(payment.id)).map((payment) => ({ sourceType: 'PAYMENT', sourceId: payment.id, paymentId: payment.id, bookingId: payment.bookingId, paymentVersion: payment.paymentVersion, version: payment.paymentVersion, amountMinorSigned: payment.amountMinor, currency: payment.currency, occurredAt: payment.paidAt, accountId: null, reference: payment.reference }));
  const refunds: FinancePaymentMoneySource[] = adjustments.filter((adjustment) => adjustment.kind === 'REFUND').map((adjustment) => {
    const original = originals.get(adjustment.paymentId);
    if (!original || original.bookingId !== adjustment.bookingId || original.currency !== adjustment.currency) throw new Error('FINANCE_REFUND_SOURCE_INVARIANT');
    return { sourceType: 'REFUND', sourceId: adjustment.id, paymentId: adjustment.paymentId, bookingId: adjustment.bookingId, paymentVersion: original.paymentVersion, version: adjustment.sequence + 1, amountMinorSigned: -adjustment.amountMinor, currency: adjustment.currency, occurredAt: adjustment.occurredAt, accountId: adjustment.accountId, reference: null };
  });
  return [...receipts, ...refunds];
}
