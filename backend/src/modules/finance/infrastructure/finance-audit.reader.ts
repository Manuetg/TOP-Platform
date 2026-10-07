import { FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceAuditItem, MovementSource } from '../domain/finance.types';
import type { FinanceTransaction } from './finance-prisma-context';
import { readFinancePaymentCashSources } from './finance-payment-cash.sources';

async function financeAuditOrigins(tx: FinanceTransaction, businessId: string, sourceType: MovementSource, sourceId: string): Promise<string[]> {
  if (sourceType === 'PAYMENT') {
    const { payments } = await readFinancePaymentCashSources(tx, businessId);
    const link = await tx.financePaymentLink.findFirst({ where: { businessId, paymentId: sourceId } });
    if (!link || !payments.some(row => row.id === sourceId)) throw new FinanceNotFoundError('Origen no disponible.');
    return [sourceId, link.id];
  }
  if (sourceType === 'VOID' || sourceType === 'REFUND') {
    const { paymentAdjustments } = await readFinancePaymentCashSources(tx, businessId);
    const adjustment = paymentAdjustments.find(row => row.id === sourceId && row.kind === sourceType);
    if (!adjustment) throw new FinanceNotFoundError('Origen no disponible.');
    return [adjustment.id];
  }
  const readers = {
    OPENING: async (): Promise<string[] | null> => {
      const row = await tx.financeOpening.findFirst({ where: { businessId, id: sourceId } });
      return row ? [row.id, row.accountId] : null;
    },
    SETTLEMENT: async (): Promise<string[] | null> => {
      const row = await tx.financeSettlement.findFirst({ where: { businessId, id: sourceId } });
      return row ? [row.id, row.expenseId] : null;
    },
    TRANSFER: async (): Promise<string[] | null> => {
      const row = await tx.financeTransfer.findFirst({ where: { businessId, id: sourceId } });
      return row ? [row.id] : null;
    },
    MOVEMENT: async (): Promise<string[] | null> => {
      const row = await tx.financeCashMovement.findFirst({ where: { businessId, id: sourceId } });
      return row ? [row.id] : null;
    },
  };
  const ids = await readers[sourceType]();
  if (!ids) throw new FinanceNotFoundError('Origen no disponible.');
  return ids;
}

export async function readFinanceAudit(tx: FinanceTransaction, businessId: string, sourceType: MovementSource, sourceId: string): Promise<FinanceAuditItem[]> {
  const ids = await financeAuditOrigins(tx, businessId, sourceType, sourceId);
  const review = await tx.financeReview.findUnique({ where: { businessId_sourceType_sourceId: { businessId, sourceType, sourceId } } });
  if (review) ids.push(review.id);
  if (sourceType === 'MOVEMENT') {
    const count = await tx.financeCashCount.findFirst({ where: { businessId, adjustmentId: sourceId } });
    if (count) ids.push(count.id);
  }
  const audits = await tx.financeAudit.findMany({ where: { businessId, sourceId: { in: ids } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
  return audits.map((row) => ({ id: row.id, action: row.action, sourceId: row.sourceId, actorUserId: row.actorUserId, occurredAt: row.occurredAt.toISOString(), details: row.details }));
}
