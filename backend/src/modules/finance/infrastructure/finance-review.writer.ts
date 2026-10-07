import type { FinanceCommand, FinanceMutation, FinanceResult, MovementSource } from '../domain/finance.types';
import { FinanceNotFoundError } from '../domain/finance.errors';
import { requireFinanceVersion } from '../application/finance-command-rules';
import { readFinancePaymentCashSources, financeReceiptSourceVersion } from './finance-payment-cash.sources';
import type { FinanceTransaction } from './finance-prisma-context';

async function financeSourceVersion(tx: FinanceTransaction, businessId: string, source: MovementSource, id: string): Promise<number> {
  if (source === 'PAYMENT') {
    const { payments } = await readFinancePaymentCashSources(tx, businessId);
    const link = await tx.financePaymentLink.findFirst({ where: { businessId, paymentId: id } });
    const payment = payments.find(row => row.id === id);
    if (!link || !payment) throw new FinanceNotFoundError('Movimiento no disponible.');
    return financeReceiptSourceVersion(payment.paymentVersion, link.version);
  }
  if (source === 'VOID' || source === 'REFUND') return adjustmentSourceVersion(tx, businessId, source, id);
  const readers = {
    OPENING: () => tx.financeOpening.findFirst({ where: { businessId, id }, select: { id: true } }),
    SETTLEMENT: () => tx.financeSettlement.findFirst({ where: { businessId, id }, select: { id: true } }),
    TRANSFER: () => tx.financeTransfer.findFirst({ where: { businessId, id }, select: { id: true } }),
    MOVEMENT: () => tx.financeCashMovement.findFirst({ where: { businessId, id }, select: { id: true } }),
  };
  if (!await readers[source]()) throw new FinanceNotFoundError('Movimiento no disponible.');
  return 1;
}

async function adjustmentSourceVersion(tx: FinanceTransaction, businessId: string, source: 'VOID' | 'REFUND', id: string): Promise<number> {
  const { paymentAdjustments } = await readFinancePaymentCashSources(tx, businessId);
  const adjustment = paymentAdjustments.find(row => row.id === id && row.kind === source);
  if (!adjustment) throw new FinanceNotFoundError('Movimiento no disponible.');
  if (source === 'REFUND') return adjustment.sequence + 1;
  const link = await tx.financePaymentLink.findFirst({ where: { businessId, paymentId: adjustment.paymentId } });
  if (!link) throw new FinanceNotFoundError('La corrección registral no tiene cuenta vinculada.');
  return financeReceiptSourceVersion(adjustment.sequence + 1, link.version);
}

export async function writeFinanceReview(tx: FinanceTransaction, input: FinanceMutation, command: Extract<FinanceCommand, { type: 'REVIEW_MOVEMENT' }>): Promise<FinanceResult> {
  const actualSourceVersion = await financeSourceVersion(tx, input.businessId, command.sourceType, command.sourceId);
  requireFinanceVersion(actualSourceVersion, command.sourceVersion);
  const where = { businessId_sourceType_sourceId: { businessId: input.businessId, sourceType: command.sourceType, sourceId: command.sourceId } };
  const review = await tx.financeReview.findUnique({ where });
  requireFinanceVersion(review?.version ?? 0, command.expectedVersion);
  if (review && review.reviewed === command.reviewed && review.sourceVersion === command.sourceVersion && review.reason === command.reason && review.recordedByUserId === input.actorUserId) return { id: review.id, version: review.version, type: command.type };
  const data = { sourceVersion: command.sourceVersion, reviewed: command.reviewed, reason: command.reason, recordedByUserId: input.actorUserId };
  const row = review ? await tx.financeReview.update({ where, data: { ...data, version: { increment: 1 } } }) : await tx.financeReview.create({ data: { ...data, businessId: input.businessId, sourceType: command.sourceType, sourceId: command.sourceId } });
  return { id: row.id, version: row.version, type: command.type };
}
