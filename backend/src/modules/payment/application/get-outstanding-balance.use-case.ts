import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BookingRepository } from '../../booking/booking.contract';
import type { BusinessRepository } from '../../business/business.contract';
import type { PricingSnapshotRepository } from '../../pricing/pricing.contract';
import {
  OUTSTANDING_BALANCE_REPOSITORY,
  type OutstandingBalanceProjection,
  type OutstandingBalanceRepository,
} from '../domain/outstanding-balance';

export type FinancialStatus =
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE';

export interface OutstandingBalanceResponse {
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  paidAmountMinor: number;
  outstandingAmountMinor: number;
  overdueAmountMinor: number;
  financialStatus: FinancialStatus;
  nextDueDate: string | null;
  nextDueAmountMinor: number | null;
}

export class OutstandingBalanceNotFoundError extends Error {}
export class OutstandingBalanceConflictError extends Error {}
export class OutstandingBalanceInvariantError extends Error {}

@Injectable()
export class GetOutstandingBalanceUseCase {
  private readonly logger = new Logger(GetOutstandingBalanceUseCase.name);

  constructor(
    @Inject(OUTSTANDING_BALANCE_REPOSITORY)
    private readonly balances: OutstandingBalanceRepository,
    @Inject('PAYMENT_BOOKING_LOOKUP')
    private readonly bookings: BookingRepository,
    @Inject('PAYMENT_SNAPSHOT_LOOKUP')
    private readonly snapshots: PricingSnapshotRepository,
    @Inject('PAYMENT_BUSINESS_LOOKUP')
    private readonly businesses: BusinessRepository,
  ) {}

  async execute(
    businessId: string,
    bookingId: string,
  ): Promise<OutstandingBalanceResponse> {
    const business = await this.businesses.findById(businessId);
    if (!business) {
      throw new OutstandingBalanceNotFoundError('El negocio no existe.');
    }

    const booking = await this.bookings.findByIdAndBusinessId(
      bookingId,
      businessId,
    );
    if (!booking) {
      throw new OutstandingBalanceNotFoundError('La reserva no existe.');
    }

    const snapshot = await this.snapshots.findByBookingId(bookingId);
    if (!snapshot || snapshot.businessId !== businessId) {
      throw new OutstandingBalanceConflictError(
        'La reserva no tiene un PricingSnapshot confirmado.',
      );
    }

    const projection = await this.balances.calculate({
      businessId,
      bookingId,
      businessLocalDate: localDateInTimeZone(new Date(), business.timezone),
    });
    const outstandingAmountMinor =
      snapshot.totalAmountMinor - projection.paidAmountMinor;

    this.assertInvariants(
      businessId,
      bookingId,
      snapshot.totalAmountMinor,
      outstandingAmountMinor,
      projection,
    );

    return {
      bookingId,
      currency: snapshot.currency,
      totalAmountMinor: snapshot.totalAmountMinor,
      paidAmountMinor: projection.paidAmountMinor,
      outstandingAmountMinor,
      overdueAmountMinor: projection.overdueAmountMinor,
      financialStatus: financialStatus(
        projection.paidAmountMinor,
        outstandingAmountMinor,
        projection.overdueAmountMinor,
      ),
      nextDueDate:
        projection.nextDueDate?.toISOString().slice(0, 10) ?? null,
      nextDueAmountMinor: projection.nextDueAmountMinor,
    };
  }

  private assertInvariants(
    businessId: string,
    bookingId: string,
    totalAmountMinor: number,
    outstandingAmountMinor: number,
    projection: OutstandingBalanceProjection,
  ): void {
    const reason = invariantViolation(
      totalAmountMinor,
      outstandingAmountMinor,
      projection,
    );

    if (reason) {
      this.logger.error({
        event: 'outstanding_balance_invariant_violation',
        businessId,
        bookingId,
        reason,
      });
      throw new OutstandingBalanceInvariantError(
        'La información financiera persistida viola una invariante.',
      );
    }
  }
}

export function localDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function isValidMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function invariantViolation(
  totalAmountMinor: number,
  outstandingAmountMinor: number,
  projection: OutstandingBalanceProjection,
): string | null {
  const money = [
    totalAmountMinor,
    projection.paidAmountMinor,
    projection.installmentTotalAmountMinor,
    projection.appliedAmountMinor,
    projection.overdueAmountMinor,
  ];
  if (!money.every(isValidMoney)) return 'INVALID_MONETARY_AGGREGATE';
  if (
    projection.paidAmountMinor > totalAmountMinor ||
    outstandingAmountMinor < 0
  ) {
    return 'PAYMENTS_EXCEED_PRICING_SNAPSHOT';
  }
  return projection.paymentPlanId === null
    ? invariantWithoutPlan(projection)
    : invariantWithPlan(totalAmountMinor, outstandingAmountMinor, projection);
}

function invariantWithoutPlan(
  projection: OutstandingBalanceProjection,
): string | null {
  const hasPlanDetails =
    projection.planTotalAmountMinor !== null ||
    projection.installmentTotalAmountMinor !== 0 ||
    projection.appliedAmountMinor !== 0 ||
    projection.overdueAmountMinor !== 0 ||
    projection.nextDueDate !== null ||
    projection.nextDueAmountMinor !== null;
  return hasPlanDetails ? 'PLAN_DETAILS_WITHOUT_PLAN' : null;
}

function invariantWithPlan(
  totalAmountMinor: number,
  outstandingAmountMinor: number,
  projection: OutstandingBalanceProjection,
): string | null {
  if (
    projection.planTotalAmountMinor !== totalAmountMinor ||
    projection.installmentTotalAmountMinor !== totalAmountMinor
  ) {
    return 'PAYMENT_PLAN_TOTAL_MISMATCH';
  }
  if (projection.appliedAmountMinor !== projection.paidAmountMinor) {
    return 'PAYMENT_APPLICATION_TOTAL_MISMATCH';
  }
  if (projection.overdueAmountMinor > outstandingAmountMinor) {
    return 'OVERDUE_EXCEEDS_OUTSTANDING';
  }
  return invalidNextDue(outstandingAmountMinor, projection)
    ? 'INVALID_NEXT_DUE'
    : null;
}

function invalidNextDue(
  outstandingAmountMinor: number,
  projection: OutstandingBalanceProjection,
): boolean {
  const oneFieldIsMissing =
    (projection.nextDueDate === null) !==
    (projection.nextDueAmountMinor === null);
  const amountIsInvalid =
    projection.nextDueAmountMinor !== null &&
    (projection.nextDueAmountMinor <= 0 ||
      projection.nextDueAmountMinor > outstandingAmountMinor);
  return oneFieldIsMissing || amountIsInvalid;
}

function financialStatus(
  paidAmountMinor: number,
  outstandingAmountMinor: number,
  overdueAmountMinor: number,
): FinancialStatus {
  if (outstandingAmountMinor === 0) return 'PAID';
  if (overdueAmountMinor > 0) return 'OVERDUE';
  if (paidAmountMinor > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}
