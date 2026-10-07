import { Prisma, type FinanceCatalog, type FinanceSettlement, type FinancePaymentLink, type FinanceTransfer, type FinanceCashMovement, type FinanceReview, type FinanceCashCount } from '@prisma/client';
import type { FinancePaymentSource, FinancePaymentAdjustmentSource } from '../../payment/payment.contract';
import { requireFinanceSourceLimit, requireFinancePaymentCurrency } from '../application/finance-command-rules';
import { financeExpenseInclude, type FinanceTransaction, type FinanceExpenseRow } from './finance-prisma-context';
import { readFinancePaymentCashSources } from './finance-payment-cash.sources';

export const FINANCE_SOURCE_LIMIT = 5000;

export async function loadFinanceSources(tx: FinanceTransaction, businessId: string, from: string, to: string, timezone: string): Promise<FinanceSources> {
  const bounds = await tx.$queryRaw<{ from: Date; to: Date }[]>`SELECT ((CAST(${from} AS date)::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC') AS "from", ((CAST(${to} AS date)::timestamp AT TIME ZONE ${timezone}) AT TIME ZONE 'UTC') AS "to"`;
  if (!bounds[0]) throw new Error('FINANCE_BOUNDS_UNAVAILABLE');
  const cut = bounds[0].to;
  const take = FINANCE_SOURCE_LIMIT + 1;
  const [catalogs, resources, accounts, expenses, settlements, links, transfers, cashMovements, reviews, cashCounts, paymentSources] = await Promise.all([
    tx.financeCatalog.findMany({ where: { businessId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }, { id: 'asc' }], take }),
    tx.resource.findMany({ where: { businessId }, select: { id: true, name: true, status: true }, orderBy: { id: 'asc' }, take }),
    tx.financeAccount.findMany({ where: { businessId }, include: { opening: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take }),
    tx.financeExpense.findMany({ where: { businessId, consumedOn: { gte: new Date(from), lt: new Date(to) } }, include: financeExpenseInclude, orderBy: [{ consumedOn: 'asc' }, { id: 'asc' }], take }),
    tx.financeSettlement.findMany({ where: { businessId, occurredAt: { lt: cut } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take }),
    tx.financePaymentLink.findMany({ where: { businessId }, orderBy: { id: 'asc' }, take }),
    tx.financeTransfer.findMany({ where: { businessId, occurredAt: { lt: cut } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take }),
    tx.financeCashMovement.findMany({ where: { businessId, occurredAt: { lt: cut } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take }),
    tx.financeReview.findMany({ where: { businessId }, orderBy: { id: 'asc' }, take }),
    tx.financeCashCount.findMany({ where: { businessId, occurredAt: { gte: bounds[0].from, lt: cut } }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take }),
    readFinancePaymentCashSources(tx, businessId),
  ]);
  const { payments, paymentAdjustments } = paymentSources;
  requireFinancePaymentCurrency(payments);
  const settlementIds = new Set([...settlements.map((row) => row.id), ...expenses.flatMap((expense) => expense.settlements.map((row) => row.id))]);
  const count = catalogs.length + resources.length + accounts.length + expenses.length + expenses.reduce((sum, expense) => sum + expense.lines.length, 0) + settlementIds.size + links.length + transfers.length + cashMovements.length + reviews.length + cashCounts.length + payments.length + paymentAdjustments.length + accounts.filter((account) => account.opening).length;
  requireFinanceSourceLimit(count, FINANCE_SOURCE_LIMIT);
  const latestReviewAudits = reviews.length === 0 ? [] : await tx.$queryRaw<{ sourceId: string; occurredAt: Date }[]>(Prisma.sql`SELECT DISTINCT ON ("sourceId") "sourceId", "occurredAt" FROM "FinanceAudit" WHERE "businessId"=${businessId} AND action='REVIEW_MOVEMENT' AND "sourceId" IN (${Prisma.join(reviews.map((review) => review.id))}) AND (details->'command'->>'expectedVersion')::int < (details->'result'->>'version')::int ORDER BY "sourceId", (details->'result'->>'version')::int DESC NULLS LAST, "occurredAt" ASC, id ASC`);
  const reviewOccurredAt = Object.fromEntries(latestReviewAudits.map((audit) => [audit.sourceId, audit.occurredAt.toISOString()]));
  return { bounds: bounds[0], catalogs, resources, accounts, expenses, settlements, links, transfers, cashMovements, reviews, reviewOccurredAt, cashCounts, payments, paymentAdjustments };
}

export interface FinanceSources {
  bounds: { from: Date; to: Date };
  catalogs: FinanceCatalog[];
  resources: { id: string; name: string; status: string }[];
  accounts: Prisma.FinanceAccountGetPayload<{ include: { opening: true } }>[];
  expenses: FinanceExpenseRow[];
  settlements: FinanceSettlement[];
  links: FinancePaymentLink[];
  transfers: FinanceTransfer[];
  cashMovements: FinanceCashMovement[];
  reviews: FinanceReview[];
  reviewOccurredAt: Record<string, string>;
  cashCounts: FinanceCashCount[];
  payments: FinancePaymentSource[];
  paymentAdjustments: FinancePaymentAdjustmentSource[];
}
