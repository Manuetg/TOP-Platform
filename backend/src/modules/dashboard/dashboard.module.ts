import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BusinessModule } from '../business/business.module';
import { GetOccupancyKpiUseCase } from './application/get-occupancy-kpi.use-case';

@Module({
  imports: [BusinessModule, AvailabilityModule],
  providers: [GetOccupancyKpiUseCase],
  exports: [GetOccupancyKpiUseCase],
})
export class DashboardModule {}
