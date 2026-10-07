import { createHash } from 'node:crypto';
import { stableFinanceJson } from '../application/finance.use-cases';
import { safeMoney } from '../domain/finance-money';
import type { FinanceAccount, FinanceActor, FinanceQuery, FinanceReport, CatalogKind } from '../domain/finance.types';
import { localFinanceDate } from './finance-prisma-context';
import { mapFinanceExpense } from './finance-expense.mapper';
import { mapFinanceMovements, mapFinancePayments } from './finance-movement.mapper';
import { FINANCE_SOURCE_LIMIT, type FinanceSources } from './finance-report.loader';
import { financeCashSafe } from './finance-payment-cash.sources';

export function mapFinanceReport(actor: FinanceActor, query: FinanceQuery, timezone: string, sources: FinanceSources, now: Date): FinanceReport {
  const today = localFinanceDate(now, timezone);
  const expenses = sources.expenses.map((row) => mapFinanceExpense(row, today));
  const allPayments = mapFinancePayments(sources);
  const allMovements = mapFinanceMovements(sources, allPayments);
  const inPeriod = (instant: string): boolean => new Date(instant) >= sources.bounds.from && new Date(instant) < sources.bounds.to;
  const payments = allPayments.filter((row) => inPeriod(row.paidAt));
  const movements = allMovements.filter((row) => inPeriod(row.occurredAt));
  const accounts: FinanceAccount[] = sources.accounts.map((row) => {
    const balanceMinor = row.opening && row.opening.occurredAt < sources.bounds.to ? sumMoney(allMovements.filter((movement) => movement.accountId === row.id && movement.includedInBalance).map((movement) => movement.amountMinor)) : null;
    return { id: row.id, name: row.name, kind: row.kind as 'CASH' | 'BANK', archived: row.archived, version: row.version, opening: row.opening ? { id: row.opening.id, amountMinor: safeMoney(row.opening.amountMinor), occurredAt: row.opening.occurredAt.toISOString(), reason: row.opening.reason } : null, balanceMinor, negative: balanceMinor !== null && balanceMinor < 0 };
  });
  const cashCounts = sources.cashCounts.map((row) => ({ id: row.id, accountId: row.accountId, occurredAt: row.occurredAt.toISOString(), expectedAmountMinor: safeMoney(row.expectedAmountMinor), countedAmountMinor: safeMoney(row.countedAmountMinor), differenceMinor: safeMoney(row.differenceMinor), reason: row.reason, version: row.version, adjustmentId: row.adjustmentId, recordedByUserId: row.recordedByUserId }));
  const grossRecordedAmountMinor = financeCashSafe(payments.reduce((sum, row) => sum + BigInt(row.grossRecordedAmountMinor), 0n));
  const voidedAmountMinor = financeCashSafe(payments.reduce((sum, row) => sum + BigInt(row.voidedAmountMinor), 0n));
  const refundedAmountMinor = financeCashSafe(sources.paymentAdjustments.filter(row => row.kind === 'REFUND' && inPeriod(row.occurredAt)).reduce((sum, row) => sum + BigInt(row.amountMinor), 0n));
  const totals = {
    expenseMinor: sumMoney(expenses.map((row) => row.amountMinor)),
    operatingCostMinor: sumMoney(expenses.flatMap((row) => row.lines.filter((line) => line.operational).map((line) => line.amountMinor))),
    paymentsMinor: grossRecordedAmountMinor,
    grossRecordedAmountMinor, voidedAmountMinor, refundedAmountMinor,
    netRecordedReceiptFlowMinor: financeCashSafe(BigInt(grossRecordedAmountMinor) - BigInt(voidedAmountMinor) - BigInt(refundedAmountMinor)),
    paymentNetRetainedAmountMinor: financeCashSafe(payments.reduce((sum, row) => sum + BigInt(row.netRetainedAmountMinor), 0n)),
    settlementsMinor: sumMoney(movements.filter((row) => row.sourceType === 'SETTLEMENT').map((row) => -row.amountMinor)),
    outstandingMinor: sumMoney(expenses.map((row) => row.outstandingMinor)),
    overdueMinor: sumMoney(expenses.filter((row) => row.overdue).map((row) => row.outstandingMinor)),
    unassignedPaymentsMinor: financeCashSafe(payments.filter((row) => row.accountId === null).reduce((sum, row) => sum + BigInt(row.grossRecordedAmountMinor), 0n)),
    registeredBalanceMinor: consolidatedBalance(accounts),
  };
  const report: FinanceReport = { ...query, businessId: actor.businessId, currency: 'PYG', timeZone: timezone, basis: 'REGISTERED_OPERATIONS', asOf: now.toISOString(), token: '', sourceLimit: FINANCE_SOURCE_LIMIT, catalogs: sources.catalogs.map((row) => ({ id: row.id, kind: row.kind as CatalogKind, name: row.name, archived: row.archived, version: row.version })), resources: sources.resources.map((row) => ({ id: row.id, name: row.name, active: row.status === 'ACTIVE' })), accounts, expenses, movements, balanceSources: allMovements.filter((row) => row.includedInBalance), payments, cashCounts, totals, coverage: { unconfiguredAccountIds: accounts.filter((row) => row.balanceMinor === null).map((row) => row.id), missingEvidenceExpenseIds: expenses.filter((row) => row.evidenceMissing).map((row) => row.id), unknownHistoricalDebt: true, serviceRevenueAvailable: false } };
  report.token = createHash('sha256').update(stableFinanceJson({ ...report, asOf: null, token: null })).digest('hex');
  return report;
}

function consolidatedBalance(accounts: FinanceAccount[]): number | null {
  if (accounts.length === 0 || accounts.some((row) => row.balanceMinor === null)) return null;
  return sumMoney(accounts.map((row) => row.balanceMinor!));
}

function sumMoney(values: readonly number[]): number {
  return financeCashSafe(values.reduce((sum, value) => sum + BigInt(value), 0n));
}
