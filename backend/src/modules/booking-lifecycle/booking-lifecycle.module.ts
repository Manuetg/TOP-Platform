import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingModule } from '../booking/booking.module';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { PricingModule } from '../pricing/pricing.module';
import { ConfirmBookingUseCase } from './application/confirm-booking.use-case';
import { CancelBookingUseCase } from './application/cancel-booking.use-case';
import { SubmitBookingUseCase } from './application/submit-booking.use-case';
import {
  BOOKING_CONFIRMATION_TRANSACTION,
} from './booking-confirmation.contract';
import { PrismaBookingConfirmationTransaction } from './infrastructure/prisma-booking-confirmation.transaction';
import { BookingLifecycleController } from './presentation/booking-lifecycle.controller';

@Module({
  imports: [
    BookingModule,
    AvailabilityModule,
    BusinessModule,
    ContactModule,
    PricingModule,
  ],
  controllers: [
    BookingLifecycleController,
  ],
  providers: [
    PrismaBookingConfirmationTransaction,
    {
      provide:
        BOOKING_CONFIRMATION_TRANSACTION,
      useExisting:
        PrismaBookingConfirmationTransaction,
    },
    SubmitBookingUseCase,
    ConfirmBookingUseCase,
    CancelBookingUseCase,
  ],
})
export class BookingLifecycleModule {}
