import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import type {
  ReservationsProjectionInput,
  ReservationsProjectionReader,
  ReservationsProjectionRow,
} from '../booking.contract';
import { BookingStatus } from '../domain/booking-status.enum';

interface ReservationsRow {
  status: string;
  count: bigint;
}

@Injectable()
export class PrismaReservationsProjectionReader
implements ReservationsProjectionReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    input: ReservationsProjectionInput,
  ): Promise<ReservationsProjectionRow[]> {
    const rows = await this.prisma.$queryRaw<ReservationsRow[]>`
      SELECT
        booking.status::text AS status,
        COUNT(*)::bigint AS count
      FROM "Booking" booking
      WHERE booking."businessId" = ${input.businessId}
        AND booking."createdAt" >= (
          (CAST(${input.from} AS date)::timestamp AT TIME ZONE ${input.timeZone})
          AT TIME ZONE 'UTC'
        )
        AND booking."createdAt" < (
          (CAST(${input.to} AS date)::timestamp AT TIME ZONE ${input.timeZone})
          AT TIME ZONE 'UTC'
        )
      GROUP BY booking.status
      ORDER BY booking.status ASC
    `;

    return rows.map((row) => ({
      status: row.status as BookingStatus,
      count: safeCount(row.count),
    }));
  }
}

function safeCount(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('RESERVATIONS_PROJECTION_INVALID_COUNT');
  }
  return result;
}
