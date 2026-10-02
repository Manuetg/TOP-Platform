import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import type { BookingFinancialSummary, BookingFinancialSummaryReader } from '../application/booking-financial-summary.reader';
import type { BookingStatus } from '../domain/booking-status.enum';

interface Snapshot { bookingId: string; currency: string; totalAmountMinor: bigint; booking?: { status: string }; }
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

function requireConsistentAmounts(snapshot: Snapshot | undefined, payment: PaidAmount | undefined): void {
  if (!snapshot) {
    if (payment) throw new Error('BOOKING_FINANCIAL_SNAPSHOT_INVARIANT');
    return;
  }
  if (snapshot.totalAmountMinor < 0n) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
  if (payment && (payment.currency !== snapshot.currency || payment.amountMinor > snapshot.totalAmountMinor)) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
}

function summarize(bookingIds: string[], snapshots: Snapshot[], payments: PaymentGroup[]): Map<string, BookingFinancialSummary> {
  const prices = new Map(snapshots.map((row) => [row.bookingId, row]));
  const paid = paidAmounts(payments);
  const result = new Map<string, BookingFinancialSummary>();
  for (const bookingId of bookingIds) {
    const snapshot = prices.get(bookingId);
    const payment = paid.get(bookingId);
    requireConsistentAmounts(snapshot, payment);
    result.set(bookingId, {
      totalAmountMinor: snapshot ? fromPrismaMoney(snapshot.totalAmountMinor) : null,
      paidAmountMinor: fromPrismaMoney(payment?.amountMinor ?? 0n),
      currency: snapshot?.currency ?? null,
      ...(snapshot?.booking ? { bookingStatus: snapshot.booking.status as BookingStatus } : {}),
    });
  }
  return result;
}

@Injectable()
export class PrismaBookingFinancialSummaryReader implements BookingFinancialSummaryReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(businessId: string, bookingIds: string[]): Promise<Map<string, BookingFinancialSummary>> {
    if (bookingIds.length === 0) return new Map();
    return this.prisma.$transaction(async (transaction) => {
      const [snapshots, payments] = await Promise.all([
        transaction.pricingSnapshot.findMany({ where: { businessId, bookingId: { in: bookingIds } }, select: { bookingId: true, currency: true, totalAmountMinor: true, booking: { select: { status: true } } } }),
        transaction.payment.groupBy({ by: ['bookingId', 'currency'], where: { businessId, bookingId: { in: bookingIds }, status: 'RECORDED' }, _sum: { amountMinor: true } }),
      ]);
      return summarize(bookingIds, snapshots, payments);
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  }
}
