import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import type { BookingFinancialSummary, BookingFinancialSummaryReader } from '../application/booking-financial-summary.reader';
import type { BookingStatus } from '../domain/booking-status.enum';
import { readCurrentPricingBatch, type CurrentPricing } from '../../pricing/pricing.contract';

interface BookingState { id: string; status: string; }
interface EffectiveRow {
  bookingId: string; currency: string;
  grossRecordedAmountMinor: bigint; voidedAmountMinor: bigint;
  refundedAmountMinor: bigint; netRetainedAmountMinor: bigint;
  paymentVersion: bigint; invalidMonetaryData: boolean; applicationInvalid: boolean;
}
interface PaidAmounts {
  currency: string; grossRecordedAmountMinor: bigint; voidedAmountMinor: bigint;
  refundedAmountMinor: bigint; netRetainedAmountMinor: bigint; financialVersion: bigint;
}

function paidAmounts(rows: EffectiveRow[]): Map<string, PaidAmounts> {
  const paid = new Map<string, PaidAmounts>();
  for (const row of rows) {
    requireRowAmounts(row);
    const existing = paid.get(row.bookingId) ?? emptyAmounts(row.currency);
    if (existing.currency !== row.currency) throw new Error('BOOKING_FINANCIAL_CURRENCY_INVARIANT');
    paid.set(row.bookingId, {
      currency: row.currency,
      grossRecordedAmountMinor: existing.grossRecordedAmountMinor + row.grossRecordedAmountMinor,
      voidedAmountMinor: existing.voidedAmountMinor + row.voidedAmountMinor,
      refundedAmountMinor: existing.refundedAmountMinor + row.refundedAmountMinor,
      netRetainedAmountMinor: existing.netRetainedAmountMinor + row.netRetainedAmountMinor,
      financialVersion: existing.financialVersion + row.paymentVersion,
    });
  }
  return paid;
}

function emptyAmounts(currency: string): PaidAmounts {
  return { currency, grossRecordedAmountMinor: 0n, voidedAmountMinor: 0n, refundedAmountMinor: 0n, netRetainedAmountMinor: 0n, financialVersion: 0n };
}

function requireRowAmounts(row: EffectiveRow): void {
  if (row.invalidMonetaryData || row.applicationInvalid || row.grossRecordedAmountMinor <= 0n) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
  if (row.voidedAmountMinor < 0n || row.refundedAmountMinor < 0n || row.paymentVersion < 1n) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
  if (row.netRetainedAmountMinor < 0n || row.netRetainedAmountMinor > row.grossRecordedAmountMinor) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
}

function requireConsistentAmounts(price: CurrentPricing | undefined, payment: PaidAmounts | undefined): void {
  if (!price) {
    if (payment) throw new Error('BOOKING_FINANCIAL_SNAPSHOT_INVARIANT');
    return;
  }
  if (!Number.isSafeInteger(price.totalAmountMinor) || price.totalAmountMinor < 0 || (payment && payment.currency !== price.currency)) throw new Error('BOOKING_FINANCIAL_AMOUNT_INVARIANT');
}

function bookingSummary(price: CurrentPricing | undefined, payment: PaidAmounts | undefined, bookingStatus: BookingStatus | undefined): BookingFinancialSummary {
  requireConsistentAmounts(price, payment);
  const amounts = payment ?? emptyAmounts('PYG');
  const netRetainedAmountMinor = fromPrismaMoney(amounts.netRetainedAmountMinor);
  const totalAmountMinor = price?.totalAmountMinor ?? null;
  return {
    totalAmountMinor, paidAmountMinor: netRetainedAmountMinor, netRetainedAmountMinor,
    grossRecordedAmountMinor: fromPrismaMoney(amounts.grossRecordedAmountMinor),
    voidedAmountMinor: fromPrismaMoney(amounts.voidedAmountMinor),
    refundedAmountMinor: fromPrismaMoney(amounts.refundedAmountMinor),
    financialVersion: fromPrismaMoney(amounts.financialVersion),
    outstandingAmountMinor: totalAmountMinor === null ? 0 : Math.max(totalAmountMinor - netRetainedAmountMinor, 0),
    creditAmountMinor: totalAmountMinor === null ? 0 : Math.max(netRetainedAmountMinor - totalAmountMinor, 0),
    currency: price?.currency ?? null,
    ...(bookingStatus === undefined ? {} : { bookingStatus }),
  };
}

/** Reads Payment-owned SQL views directly to preserve the acyclic module graph. */
async function readEffectiveRows(transaction: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<EffectiveRow[]> {
  return transaction.$queryRaw<EffectiveRow[]>`
    SELECT state.*, COALESCE(app.invalid, FALSE) OR COALESCE(app.applied, 0) > state."netRetainedAmountMinor" AS "applicationInvalid"
    FROM "PaymentEffectiveState" state
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(application."effectiveAmountMinor"), 0) AS applied,
        COALESCE(BOOL_OR(application."invalidMonetaryData" OR application."businessId" <> state."businessId"
          OR application."bookingId" <> state."bookingId" OR application.currency <> state.currency
          OR application."effectiveAmountMinor" < 0 OR application."effectiveAmountMinor" > application."originalAmountMinor"), FALSE) AS invalid
      FROM "PaymentApplicationEffective" application WHERE application."paymentId" = state."paymentId"
    ) app ON TRUE
    WHERE state."businessId" = ${businessId} AND state."bookingId" = ANY(${bookingIds}::text[])
    ORDER BY state."bookingId", state."paymentId"
  `;
}

@Injectable()
export class PrismaBookingFinancialSummaryReader implements BookingFinancialSummaryReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(businessId: string, bookingIds: string[]): Promise<Map<string, BookingFinancialSummary>> {
    if (bookingIds.length === 0) return new Map();
    return this.prisma.$transaction(async (transaction) => {
      const [prices, rows, bookings] = await Promise.all([
        readCurrentPricingBatch(transaction, businessId, bookingIds),
        readEffectiveRows(transaction, businessId, bookingIds),
        transaction.booking.findMany({ where: { businessId, id: { in: bookingIds } }, select: { id: true, status: true } }),
      ]);
      const paid = paidAmounts(rows);
      const states = new Map<string, string>((bookings as BookingState[]).map((row) => [row.id, row.status]));
      return new Map(bookingIds.map((id) => [id, bookingSummary(prices.get(id), paid.get(id), states.get(id) as BookingStatus | undefined)]));
    }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  }
}
