import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import type { BookingFinancialSummary, BookingFinancialSummaryReader } from '../application/booking-financial-summary.reader';
import type { BookingStatus } from '../domain/booking-status.enum';
import { readCurrentPricingBatch, type CurrentPricing } from '../../pricing/pricing.contract';

interface BookingState { id: string; status: string; }
interface PaymentGroup { bookingId: string; currency: string; _sum: { amountMinor: bigint | null }; }
interface PaidAmount { currency: string; amountMinor: bigint; }

function paidAmounts(groups: PaymentGroup[]): Map<string, PaidAmount> {
  const paid = new Map<string, PaidAmount>();
  for (const group of groups) {
    if (paid.has(group.bookingId)) throw new Error('BOOKING_FINANCIAL_CURRENCY_INVARIANT');
    const amountMinor = group._sum.amountMinor ?? 0n;
    if (amountMinor < 0n) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
    paid.set(group.bookingId, { currency: group.currency, amountMinor });
  }
  return paid;
}

function requireConsistentAmounts(snapshot: CurrentPricing | undefined, payment: PaidAmount | undefined): void {
  if (!snapshot) {
    if (payment) throw new Error('BOOKING_FINANCIAL_SNAPSHOT_INVARIANT');
    return;
  }
  if (!Number.isSafeInteger(snapshot.totalAmountMinor) || snapshot.totalAmountMinor < 0) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
  if (payment && payment.currency !== snapshot.currency) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
}

function summarize(bookingIds: string[], prices: Map<string, CurrentPricing>, payments: PaymentGroup[], bookings: BookingState[]): Map<string, BookingFinancialSummary> {
  const states = new Map(bookings.map((row) => [row.id, row.status as BookingStatus]));
  const paid = paidAmounts(payments);
  const result = new Map<string, BookingFinancialSummary>();
  for (const bookingId of bookingIds) {
    const snapshot = prices.get(bookingId);
    const payment = paid.get(bookingId);
    requireConsistentAmounts(snapshot, payment);
    result.set(bookingId, bookingSummary(snapshot, payment, states.get(bookingId)));
  }
  return result;
}

function bookingSummary(price: CurrentPricing | undefined, payment: PaidAmount | undefined, bookingStatus: BookingStatus | undefined): BookingFinancialSummary {
  const paidAmountMinor = fromPrismaMoney(payment?.amountMinor ?? 0n);
  const totalAmountMinor = price?.totalAmountMinor ?? null;
  return { totalAmountMinor, paidAmountMinor, ...financialAmounts(totalAmountMinor, paidAmountMinor), currency: price?.currency ?? null, ...(bookingStatus === undefined ? {} : { bookingStatus }) };
}

function financialAmounts(totalAmountMinor: number | null, paidAmountMinor: number): { outstandingAmountMinor: number; creditAmountMinor: number } {
  return { outstandingAmountMinor: totalAmountMinor === null ? 0 : Math.max(totalAmountMinor - paidAmountMinor, 0), creditAmountMinor: totalAmountMinor === null ? 0 : Math.max(paidAmountMinor - totalAmountMinor, 0) };
}

@Injectable()
export class PrismaBookingFinancialSummaryReader implements BookingFinancialSummaryReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(businessId: string, bookingIds: string[]): Promise<Map<string, BookingFinancialSummary>> {
    if (bookingIds.length === 0) return new Map();
    return this.prisma.$transaction(async (transaction) => {
      const [prices, payments, bookings] = await Promise.all([
        readCurrentPricingBatch(transaction, businessId, bookingIds),
        transaction.payment.groupBy({ by: ['bookingId', 'currency'], where: { businessId, bookingId: { in: bookingIds }, status: 'RECORDED' }, _sum: { amountMinor: true } }),
        transaction.booking.findMany({ where: { businessId, id: { in: bookingIds } }, select: { id: true, status: true } }),
      ]);
      return summarize(bookingIds, prices, payments, bookings);
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  }
}
