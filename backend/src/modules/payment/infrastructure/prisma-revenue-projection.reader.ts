import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import type {
  RevenueProjection,
  RevenueProjectionInput,
  RevenueProjectionReader,
} from '../payment.contract';

interface RevenueRow {
  currency: string;
  amountMinor: bigint;
}

@Injectable()
export class PrismaRevenueProjectionReader
implements RevenueProjectionReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(input: RevenueProjectionInput): Promise<RevenueProjection> {
    const rows = await this.prisma.$queryRaw<RevenueRow[]>`
      SELECT
        payment.currency,
        SUM(payment."amountMinor")::bigint AS "amountMinor"
      FROM "Payment" payment
      WHERE payment."businessId" = ${input.businessId}
        AND payment.status = 'RECORDED'
        AND payment."paidAt" >= (
          (CAST(${input.from} AS date)::timestamp AT TIME ZONE ${input.timeZone})
          AT TIME ZONE 'UTC'
        )
        AND payment."paidAt" < (
          (CAST(${input.to} AS date)::timestamp AT TIME ZONE ${input.timeZone})
          AT TIME ZONE 'UTC'
        )
      GROUP BY payment.currency
      ORDER BY payment.currency ASC
    `;

    return {
      amounts: rows.map((row) => ({
        currency: row.currency,
        amountMinor: safeAmount(row.amountMinor),
      })),
    };
  }
}

function safeAmount(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('REVENUE_PROJECTION_INVALID_AMOUNT');
  }
  return result;
}
