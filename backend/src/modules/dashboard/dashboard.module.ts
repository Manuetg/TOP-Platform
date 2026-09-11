import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BusinessModule } from '../business/business.module';
import { PaymentModule } from '../payment/payment.module';
import { BookingModule } from '../booking/booking.module';
import { GetOccupancyKpiUseCase } from './application/get-occupancy-kpi.use-case';
import { GetRevenueKpiUseCase } from './application/get-revenue-kpi.use-case';
import { GetReservationsKpiUseCase } from './application/get-reservations-kpi.use-case';
import { GetBusinessDashboardUseCase } from './application/get-business-dashboard.use-case';
import { DashboardController } from './presentation/dashboard.controller';

@Module({
  imports: [BusinessModule, AvailabilityModule, PaymentModule, BookingModule],
  controllers: [DashboardController],
  providers: [
    GetOccupancyKpiUseCase,
    GetRevenueKpiUseCase,
    GetReservationsKpiUseCase,
    GetBusinessDashboardUseCase,
  ],
  exports: [
    GetOccupancyKpiUseCase,
    GetRevenueKpiUseCase,
    GetReservationsKpiUseCase,
    GetBusinessDashboardUseCase,
  ],
})
export class DashboardModule {}
