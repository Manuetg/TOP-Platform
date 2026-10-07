import { requireFinanceSourceLimit } from '../application/finance-command-rules';
import { safeMoney } from '../domain/finance-money';
import { type FinanceTransaction } from './finance-prisma-context';
import { readFinancePaymentCashSources, financePaymentCashFacts, financeCashSafe, requireFinanceRefundOpening } from './finance-payment-cash.sources';

export async function registeredFinanceBalance(tx: FinanceTransaction, businessId: string, accountId: string, opening: { amountMinor: bigint; occurredAt: Date }, cut: Date): Promise<number> {
  const interval = { gte: opening.occurredAt, lt: cut };
  const [settlements, transfers, movements, links, paymentSources] = await Promise.all([
    tx.financeSettlement.findMany({ where: { businessId, accountId, occurredAt: interval }, select: { amountMinor: true }, take: 5001 }),
    tx.financeTransfer.findMany({ where: { businessId, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }], occurredAt: interval }, take: 5001 }),
    tx.financeCashMovement.findMany({ where: { businessId, accountId, occurredAt: interval }, select: { amountMinor: true }, take: 5001 }),
    tx.financePaymentLink.findMany({ where: { businessId, accountId }, select: { paymentId: true, accountId: true, version: true }, take: 5001 }),
    readFinancePaymentCashSources(tx, businessId),
  ]);
  const { payments, paymentAdjustments } = paymentSources;
  requireFinanceSourceLimit(settlements.length + transfers.length + movements.length + links.length + payments.length + paymentAdjustments.length, 5000);
  const ownFacts = financePaymentCashFacts(payments, paymentAdjustments, links).filter(row => row.accountId === accountId);
  for (const fact of ownFacts) if (fact.sourceType === 'REFUND') requireFinanceRefundOpening(opening, fact.occurredAt);
  const facts = ownFacts.filter(row => new Date(row.occurredAt) >= opening.occurredAt && new Date(row.occurredAt) < cut);
  const ownAmounts = [
    safeMoney(opening.amountMinor),
    ...settlements.map((row) => -safeMoney(row.amountMinor)),
    ...transfers.map((row) => safeMoney(row.amountMinor) * (row.toAccountId === accountId ? 1 : -1)),
    ...movements.map((row) => safeMoney(row.amountMinor)),
  ];
  return financeCashSafe(ownAmounts.reduce((sum, amount) => sum + BigInt(amount), 0n) + facts.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n));
}
