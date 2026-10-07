import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { readCurrentPricing } from '../../pricing/pricing.contract';
import { OutstandingBalanceConflictError } from '../application/get-outstanding-balance.use-case';
import type {
  OutstandingBalanceProjection,
  OutstandingBalanceRepository,
} from '../domain/outstanding-balance';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { readBookingEffectiveAmounts } from './prisma-payment-effective.reader';

interface OutstandingBalanceRow {
  paymentPlanId: string | null;
  planCurrency: string | null;
  paymentCurrencyMismatch: boolean;
  invalidMonetaryData: boolean;
  paidAmountMinor: bigint;
  planTotalAmountMinor: bigint | null;
  installmentTotalAmountMinor: bigint;
  appliedAmountMinor: bigint;
  overdueAmountMinor: bigint;
  nextDueDate: Date | null;
  nextDueAmountMinor: bigint | null;
}

@Injectable()
export class PrismaOutstandingBalanceRepository
  implements OutstandingBalanceRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async calculate(input: {
    businessId: string;
    bookingId: string;
    businessLocalDate: string;
  }): Promise<OutstandingBalanceProjection> {
    return this.prisma.$transaction(
      async (transaction) => {
        const current = await readCurrentPricing(
          transaction,
          input.businessId,
          input.bookingId,
        );
        if (!current) {
          throw new OutstandingBalanceConflictError(
            'La reserva no tiene un precio acordado vigente.',
          );
        }
        const amounts = await readBookingEffectiveAmounts(transaction, input.businessId, input.bookingId, current.currency);
        const row = await readBalanceRow(transaction, input, current.currency);
        return {
          currentCurrency: current.currency,
          currentTotalAmountMinor: current.totalAmountMinor,
          currentPricingRevisionId: current.pricingRevisionId,
          ...toProjection(row),
          ...amounts,
          paidAmountMinor: amounts.netRetainedAmountMinor,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

async function readBalanceRow(
  transaction: Prisma.TransactionClient,
  input: { businessId: string; bookingId: string; businessLocalDate: string },
  currency: string,
): Promise<OutstandingBalanceRow> {
  const rows = await transaction.$queryRaw<OutstandingBalanceRow[]>`
    WITH selected_plan AS (
      SELECT id, currency, "totalAmountMinor"
      FROM "PaymentPlan"
      WHERE "businessId" = ${input.businessId}
        AND "bookingId" = ${input.bookingId}
    ),
    payment_total AS (
      SELECT
        COALESCE(SUM("netRetainedAmountMinor"), 0)::bigint AS "paidAmountMinor",
        COALESCE(BOOL_OR(currency <> ${currency}), FALSE)
          AS "paymentCurrencyMismatch",
        COALESCE(BOOL_OR("invalidMonetaryData" OR "netRetainedAmountMinor" < 0), FALSE)
          AS "invalidMonetaryData"
      FROM "PaymentEffectiveState"
      WHERE "businessId" = ${input.businessId}
        AND "bookingId" = ${input.bookingId}
    ),
    application_totals AS (
      SELECT
        application."installmentId",
        COALESCE(SUM(application."effectiveAmountMinor"), 0)::bigint AS "appliedAmountMinor",
        COALESCE(BOOL_OR(payment.currency <> ${currency}), FALSE)
          AS "paymentCurrencyMismatch",
        COALESCE(BOOL_OR(
          application."invalidMonetaryData" OR payment."invalidMonetaryData"
          OR application."effectiveAmountMinor" < 0
          OR payment."businessId" <> ${input.businessId}
          OR payment."bookingId" <> ${input.bookingId}
        ), FALSE) AS "invalidMonetaryData"
      FROM "PaymentApplicationEffective" application
      INNER JOIN "PaymentEffectiveState" payment ON payment."paymentId" = application."paymentId"
      INNER JOIN "PaymentPlanInstallment" installment
        ON installment.id = application."installmentId"
      INNER JOIN selected_plan plan
        ON plan.id = installment."paymentPlanId"
      GROUP BY application."installmentId"
    ),
    installment_balances AS (
      SELECT
        installment.id,
        installment."dueDate",
        installment."sortOrder",
        installment."amountMinor"::bigint AS "amountMinor",
        COALESCE(applications."appliedAmountMinor", 0)::bigint
          AS "appliedAmountMinor",
        COALESCE(applications."paymentCurrencyMismatch", FALSE)
          AS "paymentCurrencyMismatch",
        COALESCE(applications."invalidMonetaryData", FALSE)
          AS "invalidMonetaryData",
        (installment."amountMinor"::bigint
          - COALESCE(applications."appliedAmountMinor", 0)::bigint)
          AS "outstandingAmountMinor"
      FROM "PaymentPlanInstallment" installment
      INNER JOIN selected_plan plan
        ON plan.id = installment."paymentPlanId"
      LEFT JOIN application_totals applications
        ON applications."installmentId" = installment.id
    ),
    plan_summary AS (
      SELECT
        COALESCE(SUM("amountMinor"), 0)::bigint
          AS "installmentTotalAmountMinor",
        COALESCE(SUM("appliedAmountMinor"), 0)::bigint
          AS "appliedAmountMinor",
        COALESCE(BOOL_OR("paymentCurrencyMismatch"), FALSE)
          AS "paymentCurrencyMismatch",
        COALESCE(BOOL_OR(
          "invalidMonetaryData" OR "amountMinor" < 0
          OR "outstandingAmountMinor" < 0
        ), FALSE) AS "invalidMonetaryData",
        COALESCE(SUM(
          CASE
            WHEN "outstandingAmountMinor" > 0
              AND "dueDate" IS NOT NULL
              AND "dueDate" < CAST(${input.businessLocalDate} AS date)
            THEN "outstandingAmountMinor"
            ELSE 0
          END
        ), 0)::bigint AS "overdueAmountMinor"
      FROM installment_balances
    ),
    next_due AS (
      SELECT
        "dueDate" AS "nextDueDate",
        "outstandingAmountMinor" AS "nextDueAmountMinor"
      FROM installment_balances
      WHERE "outstandingAmountMinor" > 0
        AND "dueDate" IS NOT NULL
      ORDER BY "dueDate" ASC, "sortOrder" ASC, id ASC
      LIMIT 1
    )
    SELECT
      plan.id AS "paymentPlanId",
      plan.currency AS "planCurrency",
      payments."paidAmountMinor",
      payments."paymentCurrencyMismatch" OR summary."paymentCurrencyMismatch"
        AS "paymentCurrencyMismatch",
      payments."invalidMonetaryData" OR summary."invalidMonetaryData"
        AS "invalidMonetaryData",
      plan."totalAmountMinor" AS "planTotalAmountMinor",
      summary."installmentTotalAmountMinor",
      summary."appliedAmountMinor",
      summary."overdueAmountMinor",
      next_due."nextDueDate",
      next_due."nextDueAmountMinor"
    FROM payment_total payments
    LEFT JOIN selected_plan plan ON TRUE
    CROSS JOIN plan_summary summary
    LEFT JOIN next_due ON TRUE
  `;

  const row = rows[0];
  if (!row) throw new Error('OUTSTANDING_BALANCE_QUERY_EMPTY');
  return row;
}

function toProjection(row: OutstandingBalanceRow): Omit<OutstandingBalanceProjection, 'grossRecordedAmountMinor' | 'voidedAmountMinor' | 'refundedAmountMinor' | 'netRetainedAmountMinor' | 'financialVersion'> {
  return {
    paymentPlanId: row.paymentPlanId,
    planCurrency: row.planCurrency,
    paymentCurrencyMismatch: row.paymentCurrencyMismatch,
    invalidMonetaryData: row.invalidMonetaryData,
    paidAmountMinor: fromPrismaMoney(row.paidAmountMinor),
    planTotalAmountMinor:
      row.planTotalAmountMinor === null
        ? null
        : fromPrismaMoney(row.planTotalAmountMinor),
    installmentTotalAmountMinor: fromPrismaMoney(
      row.installmentTotalAmountMinor,
    ),
    appliedAmountMinor: fromPrismaMoney(row.appliedAmountMinor),
    overdueAmountMinor: fromPrismaMoney(row.overdueAmountMinor),
    nextDueDate: row.nextDueDate,
    nextDueAmountMinor:
      row.nextDueAmountMinor === null
        ? null
        : fromPrismaMoney(row.nextDueAmountMinor),
  };
}
