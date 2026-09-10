import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import type {
  OutstandingBalanceProjection,
  OutstandingBalanceRepository,
} from '../domain/outstanding-balance';

interface OutstandingBalanceRow {
  paymentPlanId: string | null;
  paidAmountMinor: bigint;
  planTotalAmountMinor: number | null;
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
    const rows = await this.prisma.$queryRaw<OutstandingBalanceRow[]>`
      WITH selected_plan AS (
        SELECT id, "totalAmountMinor"
        FROM "PaymentPlan"
        WHERE "businessId" = ${input.businessId}
          AND "bookingId" = ${input.bookingId}
      ),
      payment_total AS (
        SELECT COALESCE(SUM("amountMinor"), 0)::bigint AS "paidAmountMinor"
        FROM "Payment"
        WHERE "businessId" = ${input.businessId}
          AND "bookingId" = ${input.bookingId}
          AND status = 'RECORDED'
      ),
      application_totals AS (
        SELECT
          application."installmentId",
          COALESCE(SUM(application."amountMinor"), 0)::bigint AS "appliedAmountMinor"
        FROM "PaymentApplication" application
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
        payments."paidAmountMinor",
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
    return {
      paymentPlanId: row.paymentPlanId,
      paidAmountMinor: safeNumber(row.paidAmountMinor),
      planTotalAmountMinor: row.planTotalAmountMinor,
      installmentTotalAmountMinor: safeNumber(
        row.installmentTotalAmountMinor,
      ),
      appliedAmountMinor: safeNumber(row.appliedAmountMinor),
      overdueAmountMinor: safeNumber(row.overdueAmountMinor),
      nextDueDate: row.nextDueDate,
      nextDueAmountMinor:
        row.nextDueAmountMinor === null
          ? null
          : safeNumber(row.nextDueAmountMinor),
    };
  }
}

function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new Error('OUTSTANDING_BALANCE_UNSAFE_INTEGER');
  }
  return result;
}
