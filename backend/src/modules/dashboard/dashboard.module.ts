import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BusinessModule } from '../business/business.module';
import { PaymentModule } from '../payment/payment.module';
import { BookingModule } from '../booking/booking.module';
import { GetOccupancyKpiUseCase } from './application/get-occupancy-kpi.use-case';
import { GetRevenueKpiUseCase } from './application/get-revenue-kpi.use-case';
import { GetReservationsKpiUseCase } from './application/get-reservations-kpi.use-case';

@Module({
  imports: [BusinessModule, AvailabilityModule, PaymentModule, BookingModule],
  providers: [
    GetOccupancyKpiUseCase,
    GetRevenueKpiUseCase,
    GetReservationsKpiUseCase,
  ],
  exports: [
    GetOccupancyKpiUseCase,
    GetRevenueKpiUseCase,
    GetReservationsKpiUseCase,
  ],
})
export class DashboardModule {}
