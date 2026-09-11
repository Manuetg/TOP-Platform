import { ApiProperty } from '@nestjs/swagger';
import type { BusinessDashboard } from '../../application/get-business-dashboard.use-case';

export class OccupancyDashboardDto {
  @ApiProperty({ example: 18 })
  occupiedResourceNights!: number;

  @ApiProperty({ example: 25 })
  sellableResourceNights!: number;

  @ApiProperty({ type: Number, nullable: true, example: 7200 })
  occupancyRateBasisPoints!: number | null;
}

export class RevenueDashboardDto {
  @ApiProperty({ example: 'PYG' })
  currency!: string;

  @ApiProperty({ example: 12_500_000 })
  amountMinor!: number;
}

export class ReservationStatusBreakdownDto {
  @ApiProperty({ example: 1 }) DRAFT!: number;
  @ApiProperty({ example: 1 }) PENDING!: number;
  @ApiProperty({ example: 2 }) CONFIRMED!: number;
  @ApiProperty({ example: 1 }) IN_PROGRESS!: number;
  @ApiProperty({ example: 2 }) COMPLETED!: number;
  @ApiProperty({ example: 1 }) CANCELLED!: number;
  @ApiProperty({ example: 0 }) NO_SHOW!: number;
}

export class ReservationsDashboardDto {
  @ApiProperty({ example: 8 })
  total!: number;

  @ApiProperty({ type: ReservationStatusBreakdownDto })
  byStatus!: ReservationStatusBreakdownDto;
}

export class DashboardResponseDto {
  @ApiProperty({ type: OccupancyDashboardDto })
  occupancy!: OccupancyDashboardDto;

  @ApiProperty({ type: RevenueDashboardDto })
  revenue!: RevenueDashboardDto;

  @ApiProperty({ type: ReservationsDashboardDto })
  reservations!: ReservationsDashboardDto;

  static fromApplication(value: BusinessDashboard): DashboardResponseDto {
    return {
      occupancy: value.occupancy,
      revenue: value.revenue,
      reservations: value.reservations,
    };
  }
}
