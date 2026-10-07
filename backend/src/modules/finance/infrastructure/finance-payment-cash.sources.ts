import { readRecordedPaymentsForFinance, readPaymentAdjustmentsForFinance, PaymentAdjustmentInvariantError, type FinancePaymentSource, type FinancePaymentAdjustmentSource } from '../../payment/payment.contract';
import type { FinanceTransaction } from './finance-prisma-context';
import type { FinancePayment } from '../domain/finance.types';
import { FinanceConflictError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';

export type FinancePaymentCashState = Pick<FinancePayment, 'grossRecordedAmountMinor' | 'voidedAmountMinor' | 'refundedAmountMinor' | 'netRetainedAmountMinor' | 'paymentVersion' | 'effectiveStatus'>;
export interface FinancePaymentCashFact { id: string; paymentId: string; bookingId: string; sourceType: 'PAYMENT' | 'VOID' | 'REFUND'; sourceVersion: number; amountMinor: number; occurredAt: string; accountId: string | null }

export async function readFinancePaymentCashSources(tx: FinanceTransaction, businessId: string): Promise<{ payments: FinancePaymentSource[]; paymentAdjustments: FinancePaymentAdjustmentSource[] }> {
  try {
    const [payments, paymentAdjustments] = await Promise.all([readRecordedPaymentsForFinance(tx, businessId), readPaymentAdjustmentsForFinance(tx, businessId)]);
    requireFinanceCashSources(payments, paymentAdjustments);
    return { payments, paymentAdjustments };
  } catch (error) {
    if (error instanceof PaymentAdjustmentInvariantError || (error instanceof Error && ['FINANCE_PAYMENT_EFFECTIVE_INVARIANT', 'FINANCE_PAYMENT_ADJUSTMENT_INVARIANT', 'FINANCE_REFUND_SOURCE_INVARIANT'].includes(error.message))) throw new FinanceConflictError('El cobro o su moneda histórica no conservan un estado válido en PYG; Finance no convierte su historial.');
    throw error;
  }
}

export function financeCashSafe(value: bigint): number {
  try { return safeMoney(value); } catch { throw new FinanceConflictError('La suma consultada supera el rango seguro PYG; reduce el conjunto.'); }
}

export function requireFinanceRefundOpening(opening: { occurredAt: Date } | null | undefined, occurredAt: string): void {
  if (!opening || new Date(occurredAt) < opening.occurredAt) throw new FinanceConflictError('La devolución no conserva una apertura válida de su cuenta propia.');
}

function positiveMoney(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) throw new FinanceConflictError('La fuente monetaria registrada no es válida.');
  return BigInt(value);
}

export function requireFinanceCashSources(payments: readonly FinancePaymentSource[], adjustments: readonly FinancePaymentAdjustmentSource[]): void {
  if (payments.length + adjustments.length > 5000) throw new FinanceConflictError('Las fuentes Payment superan 5000 registros; no se truncan.');
  const original = new Map(payments.map(row => [row.id, row]));
  if (original.size !== payments.length || new Set(adjustments.map(row => row.id)).size !== adjustments.length) throw new FinanceConflictError('La consulta repite fuentes Payment.');
  for (const row of adjustments) {
    const payment = original.get(row.paymentId);
    if (!payment || row.bookingId !== payment.bookingId || row.currency !== payment.currency) throw new FinanceConflictError('El ajuste no conserva el cobro original del mismo negocio.');
  }
  for (const payment of payments) financePaymentCashState(payment, adjustments);
}

/** A cut selects refunds by their own date; void always corrects the original paidAt registry. */
export function financePaymentCashState(payment: FinancePaymentSource, adjustments: readonly FinancePaymentAdjustmentSource[], cut?: Date): FinancePaymentCashState {
  if (payment.currency !== 'PYG') throw new FinanceConflictError('El cobro registrado no está en PYG; Finance no convierte su historial.');
  const gross = positiveMoney(payment.amountMinor);
  const paidAt = new Date(payment.paidAt);
  if (!Number.isFinite(paidAt.getTime())) throw new FinanceConflictError('El cobro no conserva su instante original.');
  const own = adjustments.filter(row => row.paymentId === payment.id).sort((left, right) => left.sequence - right.sequence);
  validateAdjustments(payment, own);
  if (payment.paymentVersion !== own.length + 1) throw new FinanceConflictError('La versión pública del cobro no conserva todos sus ajustes.');
  const voided = own.filter(row => row.kind === 'VOID').reduce((sum, row) => sum + positiveMoney(row.amountMinor), 0n);
  const refunds = own.filter(row => row.kind === 'REFUND');
  const refundedAll = refunds.reduce((sum, row) => sum + positiveMoney(row.amountMinor), 0n);
  requireAdjustmentTotals(gross, voided, refundedAll);
  const refunded = refunds.filter(row => !cut || new Date(row.occurredAt) < cut).reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  const net = gross - voided - refunded;
  const effectiveStatus = voided > 0n ? 'VOIDED' : net === 0n ? 'REFUNDED' : refunded > 0n ? 'PARTIALLY_REFUNDED' : 'RETAINED';
  return { grossRecordedAmountMinor: financeCashSafe(gross), voidedAmountMinor: financeCashSafe(voided), refundedAmountMinor: financeCashSafe(refunded), netRetainedAmountMinor: financeCashSafe(net), paymentVersion: payment.paymentVersion, effectiveStatus };
}

function requireAdjustmentTotals(gross: bigint, voided: bigint, refunded: bigint): void {
  if (voided + refunded > gross || (voided > 0n && (voided !== gross || refunded > 0n))) throw new FinanceConflictError('VOID y REFUND no conservan el original; no se combina una anulación con devoluciones.');
}

function validateAdjustments(payment: FinancePaymentSource, adjustments: readonly FinancePaymentAdjustmentSource[]): void {
  for (const [index, row] of adjustments.entries()) {
    positiveMoney(row.amountMinor);
    const occurredAt = new Date(row.occurredAt);
    if (row.bookingId !== payment.bookingId || row.currency !== 'PYG' || row.sequence !== index + 1 || !['VOID', 'REFUND'].includes(row.kind) || !Number.isFinite(occurredAt.getTime())) throw new FinanceConflictError('El ajuste público no conserva su fuente y secuencia.');
    requireAdjustmentAccount(row, payment.paidAt);
  }
}

function requireAdjustmentAccount(row: FinancePaymentAdjustmentSource, paidAt: string): void {
  if (row.kind === 'VOID' && (row.accountId !== null || new Date(row.occurredAt).getTime() !== new Date(paidAt).getTime())) throw new FinanceConflictError('VOID corrige el instante original y no registra una cuenta de egreso.');
  if (row.kind === 'REFUND' && (!row.accountId || new Date(row.occurredAt) < new Date(paidAt))) throw new FinanceConflictError('La devolución requiere su cuenta propia y fecha posterior al cobro.');
}

export function financeReceiptSourceVersion(paymentVersion: number, linkVersion: number): number {
  if (!Number.isSafeInteger(paymentVersion) || paymentVersion < 1 || !Number.isSafeInteger(linkVersion) || linkVersion < 1) throw new FinanceConflictError('La fuente del movimiento no conserva versiones válidas.');
  return financeCashSafe(BigInt(paymentVersion) + BigInt(linkVersion) - 1n);
}

export function financePaymentCashFacts(payments: readonly FinancePaymentSource[], adjustments: readonly FinancePaymentAdjustmentSource[], links: readonly { paymentId: string; accountId: string; version: number }[]): FinancePaymentCashFact[] {
  requireFinanceCashSources(payments, adjustments);
  const originals = new Map(payments.map(row => [row.id, row]));
  const accounts = new Map(links.map(row => [row.paymentId, row]));
  const receipts: FinancePaymentCashFact[] = payments.map(row => { const link = accounts.get(row.id); return { id: row.id, paymentId: row.id, bookingId: row.bookingId, sourceType: 'PAYMENT', sourceVersion: link ? financeReceiptSourceVersion(row.paymentVersion, link.version) : row.paymentVersion, amountMinor: row.amountMinor, occurredAt: row.paidAt, accountId: link?.accountId ?? null }; });
  const corrections: FinancePaymentCashFact[] = adjustments.map(row => {
    const original = originals.get(row.paymentId)!; const link = accounts.get(row.paymentId);
    return { id: row.id, paymentId: row.paymentId, bookingId: row.bookingId, sourceType: row.kind, sourceVersion: row.kind === 'VOID' && link ? financeReceiptSourceVersion(row.sequence + 1, link.version) : row.sequence + 1, amountMinor: -row.amountMinor, occurredAt: row.kind === 'VOID' ? original.paidAt : row.occurredAt, accountId: row.kind === 'VOID' ? link?.accountId ?? null : row.accountId };
  });
  return [...receipts, ...corrections];
}
