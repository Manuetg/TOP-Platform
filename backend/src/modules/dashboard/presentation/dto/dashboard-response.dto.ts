import { ApiProperty } from '@nestjs/swagger';
import type { BusinessDashboard } from '../../application/get-business-dashboard.use-case';

export class OccupancySegmentDashboardDto {
  @ApiProperty() occupiedNights!: number;
  @ApiProperty() sellableNights!: number;
  @ApiProperty() availableNights!: number;
  @ApiProperty({ nullable: true }) occupancyRateBasisPoints!: number | null;
}

export class WeekendAvailabilityItemDashboardDto {
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() totalResources!: number;
  @ApiProperty() availableResources!: number;
  @ApiProperty({ enum: ['AVAILABLE', 'PARTIAL', 'FULL'] }) status!: string;
}

export class WeekendAvailabilityDashboardDto {
  @ApiProperty() total!: number;
  @ApiProperty() full!: number;
  @ApiProperty() partial!: number;
  @ApiProperty() available!: number;
  @ApiProperty({ type: [WeekendAvailabilityItemDashboardDto] }) items!: WeekendAvailabilityItemDashboardDto[];
}

export class DailyOccupancyDashboardDto {
  @ApiProperty() date!: string;
  @ApiProperty() occupiedResourceNights!: number;
  @ApiProperty() sellableResourceNights!: number;
  @ApiProperty() availableResourceNights!: number;
  @ApiProperty({ type: Number, nullable: true }) occupancyRateBasisPoints!: number | null;
}

export class OccupancyDashboardDto {
  @ApiProperty({ example: 18 })
  occupiedResourceNights!: number;

  @ApiProperty({ example: 25 })
  sellableResourceNights!: number;

  @ApiProperty({ required: false, type: [DailyOccupancyDashboardDto] })
  daily?: DailyOccupancyDashboardDto[];

  @ApiProperty({ type: Number, nullable: true, example: 7200 })
  occupancyRateBasisPoints!: number | null;

  @ApiProperty({ required: false, type: OccupancySegmentDashboardDto })
  weekend?: OccupancySegmentDashboardDto;

  @ApiProperty({ required: false, type: OccupancySegmentDashboardDto })
  weekday?: OccupancySegmentDashboardDto;

  @ApiProperty({ required: false, type: WeekendAvailabilityDashboardDto })
  weekends?: WeekendAvailabilityDashboardDto;
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
