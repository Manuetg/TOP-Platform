import { Injectable } from '@nestjs/common';
import {
  GetOccupancyKpiUseCase,
  type OccupancyKpi,
} from './get-occupancy-kpi.use-case';
import {
  GetReservationsKpiUseCase,
  type ReservationsKpi,
} from './get-reservations-kpi.use-case';
import {
  GetRevenueKpiUseCase,
  type RevenueKpi,
} from './get-revenue-kpi.use-case';

export interface BusinessDashboardInput {
  businessId: string;
  from: string;
  to: string;
}

export interface BusinessDashboard {
  occupancy: OccupancyKpi;
  revenue: RevenueKpi;
  reservations: ReservationsKpi;
}

@Injectable()
export class GetBusinessDashboardUseCase {
  constructor(
    private readonly occupancy: GetOccupancyKpiUseCase,
    private readonly revenue: GetRevenueKpiUseCase,
    private readonly reservations: GetReservationsKpiUseCase,
  ) {}

  async execute(input: BusinessDashboardInput): Promise<BusinessDashboard> {
    const [occupancy, revenue, reservations] = await Promise.all([
      this.occupancy.execute(input),
      this.revenue.execute(input),
      this.reservations.execute(input),
    ]);
    return { occupancy, revenue, reservations };
  }
}
