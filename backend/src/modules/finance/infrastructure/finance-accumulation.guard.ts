import { requireFinanceSourceLimit } from '../application/finance-command-rules';
import type { FinanceTransaction } from './finance-prisma-context';
import { guardBalanceEvents, type BalanceEvent } from '../application/finance-balance-rules';
import { readFinancePaymentCashSources, financePaymentCashFacts, financePaymentCashState, financeCashSafe, requireFinanceRefundOpening } from './finance-payment-cash.sources';

export async function guardFinanceAccumulations(tx: FinanceTransaction, businessId: string): Promise<void> {
  const expenseTotals = await tx.$queryRaw<{ expense: string; paid: string }[]>`SELECT COALESCE((SELECT SUM("amountMinor") FROM "FinanceExpense" WHERE "businessId"=${businessId}),0)::text AS expense, COALESCE((SELECT SUM("amountMinor") FROM "FinanceSettlement" WHERE "businessId"=${businessId}),0)::text AS paid`;
  const totals = expenseTotals[0];
  if (!totals) throw new Error('FINANCE_TOTALS_UNAVAILABLE');
  const expense = BigInt(totals.expense); const paid = BigInt(totals.paid);
  financeCashSafe(expense); financeCashSafe(paid); financeCashSafe(expense - paid);
  const take = 5001;
  const [accounts, settlements, transfers, movements, links, paymentSources] = await Promise.all([
    tx.financeAccount.findMany({ where: { businessId }, include: { opening: true }, take }),
    tx.financeSettlement.findMany({ where: { businessId }, take }),
    tx.financeTransfer.findMany({ where: { businessId }, take }),
    tx.financeCashMovement.findMany({ where: { businessId }, take }),
    tx.financePaymentLink.findMany({ where: { businessId }, take }),
    readFinancePaymentCashSources(tx, businessId),
  ]);
  const { payments, paymentAdjustments } = paymentSources;
  requireFinanceSourceLimit(accounts.length + settlements.length + transfers.length + movements.length + links.length + payments.length + paymentAdjustments.length, 5000);
  financeCashSafe(payments.reduce((sum, payment) => sum + BigInt(financePaymentCashState(payment, paymentAdjustments).netRetainedAmountMinor), 0n));
  const events: BalanceEvent[] = accounts.flatMap((account) => account.opening ? [{ accountId: account.id, instant: account.opening.occurredAt.getTime(), amount: account.opening.amountMinor }] : []);
  const own = [...settlements.map((row) => ({ accountId: row.accountId, instant: row.occurredAt.getTime(), amount: -row.amountMinor })),
    ...movements.map((row) => ({ accountId: row.accountId, instant: row.occurredAt.getTime(), amount: row.amountMinor })),
    ...transfers.flatMap((row) => [
    { accountId: row.fromAccountId, instant: row.occurredAt.getTime(), amount: -row.amountMinor },
    { accountId: row.toAccountId, instant: row.occurredAt.getTime(), amount: row.amountMinor },
  ])];
  const openings = new Map(accounts.map((account) => [account.id, account.opening]));
  events.push(...own.filter(event => { const opening = openings.get(event.accountId); return !!opening && event.instant >= opening.occurredAt.getTime(); }));
  for (const fact of financePaymentCashFacts(payments, paymentAdjustments, links)) {
    const opening = fact.accountId ? openings.get(fact.accountId) : null;
    if (fact.sourceType === 'REFUND') requireFinanceRefundOpening(opening, fact.occurredAt);
    if (fact.accountId && opening && new Date(fact.occurredAt) >= opening.occurredAt) events.push({ accountId: fact.accountId, instant: new Date(fact.occurredAt).getTime(), amount: BigInt(fact.amountMinor) });
  }
  guardBalanceEvents(events);
}
