import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BusinessModule } from '../business/business.module';
import { PaymentModule } from '../payment/payment.module';
import { GetOccupancyKpiUseCase } from './application/get-occupancy-kpi.use-case';
import { GetRevenueKpiUseCase } from './application/get-revenue-kpi.use-case';

@Module({
  imports: [BusinessModule, AvailabilityModule, PaymentModule],
  providers: [GetOccupancyKpiUseCase, GetRevenueKpiUseCase],
  exports: [GetOccupancyKpiUseCase, GetRevenueKpiUseCase],
})
export class DashboardModule {}
