import { safeMoney } from '../domain/finance-money';
import type { FinanceMovement, FinancePayment } from '../domain/finance.types';
import type { FinanceSources } from './finance-report.loader';
import { financePaymentCashState, financePaymentCashFacts, requireFinanceRefundOpening } from './finance-payment-cash.sources';

type RawMovement = Omit<FinanceMovement, 'includedInBalance' | 'reviewed' | 'reviewVersion' | 'reviewStale' | 'reviewDetails'>;

export function mapFinancePayments(sources: FinanceSources): FinancePayment[] {
  const links = new Map(sources.links.map((link) => [link.paymentId, link]));
  const openings = new Map(sources.accounts.map((account) => [account.id, account.opening]));
  return sources.payments.map((payment) => {
    const link = links.get(payment.id);
    const opening = link ? openings.get(link.accountId) : null;
    const includedInBalance = !!opening && new Date(payment.paidAt) >= opening.occurredAt && new Date(payment.paidAt) < sources.bounds.to;
    const state = financePaymentCashState(payment, sources.paymentAdjustments, sources.bounds.to);
    return { ...payment, ...state, accountId: link?.accountId ?? null, version: link?.version ?? 0, includedInBalance: includedInBalance && state.effectiveStatus !== 'VOIDED' };
  });
}

export function mapFinanceMovements(sources: FinanceSources, payments: FinancePayment[]): FinanceMovement[] {
  const openings = sources.accounts.flatMap((account): RawMovement[] => account.opening ? [{ id: account.opening.id, sourceType: 'OPENING', sourceId: account.opening.id, sourceVersion: 1, accountId: account.id, amountMinor: safeMoney(account.opening.amountMinor), occurredAt: account.opening.occurredAt.toISOString(), description: account.opening.reason }] : []);
  const settlements: RawMovement[] = sources.settlements.map((row) => ({ id: row.id, sourceType: 'SETTLEMENT', sourceId: row.id, sourceVersion: 1, accountId: row.accountId, amountMinor: -safeMoney(row.amountMinor), occurredAt: row.occurredAt.toISOString(), description: `Liquidación de gasto ${row.expenseId}` }));
  const paymentMovements: RawMovement[] = financePaymentCashFacts(payments, sources.paymentAdjustments, sources.links).filter(row => row.accountId !== null).map(row => ({ id: row.id, sourceType: row.sourceType, sourceId: row.id, sourceVersion: row.sourceVersion, paymentId: row.paymentId, bookingId: row.bookingId, accountId: row.accountId!, amountMinor: row.amountMinor, occurredAt: row.occurredAt, description: paymentDescription(row.sourceType, row.bookingId) }));
  const transfers = sources.transfers.flatMap((row): RawMovement[] => [
    { id: `${row.id}:FROM`, sourceType: 'TRANSFER', sourceId: row.id, sourceVersion: 1, accountId: row.fromAccountId, amountMinor: -safeMoney(row.amountMinor), occurredAt: row.occurredAt.toISOString(), description: row.reason },
    { id: `${row.id}:TO`, sourceType: 'TRANSFER', sourceId: row.id, sourceVersion: 1, accountId: row.toAccountId, amountMinor: safeMoney(row.amountMinor), occurredAt: row.occurredAt.toISOString(), description: row.reason },
  ]);
  const cashMovements: RawMovement[] = sources.cashMovements.map((row) => ({ id: row.id, sourceType: 'MOVEMENT', sourceId: row.id, sourceVersion: 1, accountId: row.accountId, amountMinor: safeMoney(row.amountMinor), occurredAt: row.occurredAt.toISOString(), description: `${row.kind}: ${row.reason}` }));
  const accounts = new Map(sources.accounts.map((account) => [account.id, account]));
  const reviews = new Map(sources.reviews.map((review) => [`${review.sourceType}:${review.sourceId}`, review]));
  return [...openings, ...settlements, ...paymentMovements, ...transfers, ...cashMovements].map((row) => {
    const opening = accounts.get(row.accountId)?.opening;
    if (row.sourceType === 'REFUND') requireFinanceRefundOpening(opening, row.occurredAt);
    const review = reviews.get(`${row.sourceType}:${row.sourceId}`);
    const includedInBalance = !!opening && new Date(row.occurredAt) >= opening.occurredAt && new Date(row.occurredAt) < sources.bounds.to;
    const reviewStale = !!review && review.sourceVersion !== row.sourceVersion;
    return { ...row, includedInBalance, reviewed: !!review?.reviewed && !reviewStale, reviewVersion: review?.version ?? 0, reviewStale, reviewDetails: currentReviewDetails(review, sources) };
  }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}

function paymentDescription(sourceType: 'PAYMENT' | 'VOID' | 'REFUND', bookingId: string): string {
  if (sourceType === 'VOID') return `Corrección registral de cobro de reserva ${bookingId}`;
  return sourceType === 'REFUND' ? `Devolución de cobro de reserva ${bookingId}` : `Cobro de reserva ${bookingId}`;
}

function currentReviewDetails(review: FinanceSources['reviews'][number] | undefined, sources: FinanceSources): FinanceMovement['reviewDetails'] {
  if (!review) return null;
  const occurredAt = sources.reviewOccurredAt[review.id];
  return occurredAt ? { actorUserId: review.recordedByUserId, occurredAt, reason: review.reason } : null;
}
