import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import type {
  OccupancyProjection,
  OccupancyProjectionInput,
  OccupancyProjectionReader,
} from '../availability.contract';

interface OccupancyRow {
  occupiedResourceNights: bigint;
  sellableResourceNights: bigint;
}

@Injectable()
export class PrismaOccupancyProjectionReader implements OccupancyProjectionReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(input: OccupancyProjectionInput): Promise<OccupancyProjection> {
    const rows = await this.prisma.$queryRaw<OccupancyRow[]>`
      WITH eligible_resources AS (
        SELECT
          resource.id,
          GREATEST(
            CAST(${input.from} AS date),
            (((resource."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.timeZone})::date)
          ) AS "effectiveFrom"
        FROM "Resource" resource
        WHERE resource."businessId" = ${input.businessId}
          AND resource.status = 'ACTIVE'
          AND (((resource."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.timeZone})::date) < CAST(${input.to} AS date)
      ),
      resource_nights AS (
        SELECT
          resource.id AS "resourceId",
          day::date AS "localDate",
          ((day::timestamp AT TIME ZONE ${input.timeZone}) AT TIME ZONE 'UTC') AS "dayStartUtc",
          (((day + interval '1 day')::timestamp AT TIME ZONE ${input.timeZone}) AT TIME ZONE 'UTC') AS "dayEndUtc"
        FROM eligible_resources resource
        CROSS JOIN LATERAL generate_series(
          resource."effectiveFrom"::timestamp,
          (CAST(${input.to} AS date) - 1)::timestamp,
          interval '1 day'
        ) day
      ),
      blocked_nights AS (
        SELECT DISTINCT night."resourceId", night."localDate"
        FROM resource_nights night
        INNER JOIN "Block" block
          ON block."businessId" = ${input.businessId}
          AND block."resourceId" = night."resourceId"
          AND block.status = 'SCHEDULED'
          AND block."startsAt" < night."dayEndUtc"
          AND block."endsAt" > night."dayStartUtc"
      ),
      occupied_nights AS (
        SELECT DISTINCT night."resourceId", night."localDate"
        FROM resource_nights night
        INNER JOIN "BookingResource" assignment
          ON assignment."resourceId" = night."resourceId"
        INNER JOIN "Booking" booking
          ON booking.id = assignment."bookingId"
          AND booking."businessId" = ${input.businessId}
          AND booking.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          AND booking."checkInDate" <= night."localDate"
          AND booking."checkOutDate" > night."localDate"
      ),
      sellable AS (
        SELECT COUNT(*)::bigint AS value
        FROM resource_nights night
        LEFT JOIN blocked_nights blocked
          ON blocked."resourceId" = night."resourceId"
          AND blocked."localDate" = night."localDate"
        WHERE blocked."resourceId" IS NULL
      ),
      occupied AS (
        SELECT COUNT(*)::bigint AS value
        FROM occupied_nights
      )
      SELECT
        occupied.value AS "occupiedResourceNights",
        sellable.value AS "sellableResourceNights"
      FROM occupied
      CROSS JOIN sellable
    `;

    const row = rows[0];
    if (!row) throw new Error('OCCUPANCY_PROJECTION_QUERY_EMPTY');
    return {
      occupiedResourceNights: safeCount(row.occupiedResourceNights),
      sellableResourceNights: safeCount(row.sellableResourceNights),
    };
  }
}

function safeCount(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('OCCUPANCY_PROJECTION_INVALID_COUNT');
  }
  return result;
}
