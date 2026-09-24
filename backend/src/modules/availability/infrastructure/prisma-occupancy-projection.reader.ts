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
interface DailyRow { localDate: Date; totalResources: bigint; occupiedResources: bigint; sellableResources: bigint; }

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
    const daily = await this.prisma.$queryRaw<DailyRow[]>`
      WITH eligible_resources AS (
        SELECT resource.id, GREATEST(CAST(${input.from} AS date), (((resource."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.timeZone})::date)) AS effective_from
        FROM "Resource" resource
        WHERE resource."businessId" = ${input.businessId} AND resource.status = 'ACTIVE'
          AND (((resource."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${input.timeZone})::date) < CAST(${input.to} AS date)
      ), days AS (
        SELECT day::date AS local_date FROM generate_series(CAST(${input.from} AS date), CAST(${input.to} AS date) - 1, interval '1 day') day
      ), grid AS (
        SELECT resource.id AS resource_id, days.local_date,
          ((days.local_date::timestamp AT TIME ZONE ${input.timeZone}) AT TIME ZONE 'UTC') AS day_start,
          (((days.local_date + 1)::timestamp AT TIME ZONE ${input.timeZone}) AT TIME ZONE 'UTC') AS day_end
        FROM eligible_resources resource JOIN days ON days.local_date >= resource.effective_from
      ), blocked AS (
        SELECT DISTINCT grid.resource_id, grid.local_date FROM grid JOIN "Block" block
          ON block."businessId" = ${input.businessId} AND block."resourceId" = grid.resource_id AND block.status = 'SCHEDULED'
          AND block."startsAt" < grid.day_end AND block."endsAt" > grid.day_start
      ), occupied AS (
        SELECT DISTINCT grid.resource_id, grid.local_date FROM grid JOIN "BookingResource" assignment ON assignment."resourceId" = grid.resource_id
          JOIN "Booking" booking ON booking.id = assignment."bookingId" AND booking."businessId" = ${input.businessId}
          AND booking.status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          AND booking."checkInDate" <= grid.local_date AND booking."checkOutDate" > grid.local_date
      )
      SELECT grid.local_date AS "localDate", COUNT(*)::bigint AS "totalResources",
        COUNT(occupied.resource_id)::bigint AS "occupiedResources",
        (COUNT(*) - COUNT(blocked.resource_id))::bigint AS "sellableResources"
      FROM grid LEFT JOIN blocked ON blocked.resource_id = grid.resource_id AND blocked.local_date = grid.local_date
        LEFT JOIN occupied ON occupied.resource_id = grid.resource_id AND occupied.local_date = grid.local_date
      GROUP BY grid.local_date ORDER BY grid.local_date ASC
    `;
    const segment = (dates: DailyRow[]) => {
      const occupiedNights = dates.reduce((sum, row) => sum + safeCount(row.occupiedResources), 0);
      const sellableNights = dates.reduce((sum, row) => sum + safeCount(row.sellableResources), 0);
      const availableNights = Math.max(0, sellableNights - occupiedNights);
      return { occupiedNights, sellableNights, availableNights, occupancyRateBasisPoints: sellableNights === 0 ? null : Math.round(occupiedNights * 10000 / sellableNights) };
    };
    const byDate = new Map(daily.map((row) => [row.localDate.toISOString().slice(0, 10), row]));
    const weekendItems = daily.filter((row) => row.localDate.getUTCDay() === 5).map((friday) => {
      const from = friday.localDate.toISOString().slice(0, 10);
      const saturdayDate = new Date(friday.localDate.getTime() + 86400000);
      const saturday = byDate.get(saturdayDate.toISOString().slice(0, 10));
      if (!saturday) return null;
      const sundayDate = new Date(friday.localDate.getTime() + 2 * 86400000);
      const totalResources = Math.min(safeCount(friday.totalResources), safeCount(saturday.totalResources));
      const availableResources = Math.min(Math.max(0, safeCount(friday.sellableResources) - safeCount(friday.occupiedResources)), Math.max(0, safeCount(saturday.sellableResources) - safeCount(saturday.occupiedResources)));
      return { from, to: sundayDate.toISOString().slice(0, 10), totalResources, availableResources, status: availableResources === 0 ? 'FULL' : availableResources === totalResources ? 'AVAILABLE' : 'PARTIAL' } as const;
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const full = weekendItems.filter((item) => item.status === 'FULL').length;
    const partial = weekendItems.filter((item) => item.status === 'PARTIAL').length;
    const available = weekendItems.filter((item) => item.status === 'AVAILABLE').length;
    return {
      occupiedResourceNights: safeCount(row.occupiedResourceNights),
      sellableResourceNights: safeCount(row.sellableResourceNights),
      daily: daily.map((item) => {
        const occupiedResourceNights = safeCount(item.occupiedResources);
        const sellableResourceNights = safeCount(item.sellableResources);
        const availableResourceNights = Math.max(0, sellableResourceNights - occupiedResourceNights);
        return {
          date: item.localDate.toISOString().slice(0, 10),
          occupiedResourceNights,
          sellableResourceNights,
          availableResourceNights,
          occupancyRateBasisPoints: sellableResourceNights === 0
            ? null
            : Math.round(occupiedResourceNights * 10_000 / sellableResourceNights),
        };
      }),
      weekend: segment(daily.filter((item) => [5, 6].includes(item.localDate.getUTCDay()))),
      weekday: segment(daily.filter((item) => ![5, 6].includes(item.localDate.getUTCDay()))),
      weekends: { total: weekendItems.length, full, partial, available, items: weekendItems },
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
