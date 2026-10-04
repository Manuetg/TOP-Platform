import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingModule } from '../booking/booking.module';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { PricingModule } from '../pricing/pricing.module';
import { ResourceModule } from '../resource/resource.module';
import { ConfirmBookingUseCase } from './application/confirm-booking.use-case';
import { CancelBookingUseCase } from './application/cancel-booking.use-case';
import { SubmitBookingUseCase } from './application/submit-booking.use-case';
import {
  BOOKING_CONFIRMATION_TRANSACTION,
} from './booking-confirmation.contract';
import { PrismaBookingConfirmationTransaction } from './infrastructure/prisma-booking-confirmation.transaction';
import { BookingLifecycleController } from './presentation/booking-lifecycle.controller';
import { IntegrationEventsModule } from '../../shared/integration-events/integration-events.module';
import { BOOKING_PENDING_CREATION } from './booking-pending-creation.contract';
import { PrismaBookingPendingCreationTransaction } from './infrastructure/prisma-booking-pending-creation.transaction';

@Module({
  imports: [
    BookingModule,
    AvailabilityModule,
    BusinessModule,
    ContactModule,
    PricingModule,
    ResourceModule,
    IntegrationEventsModule,
  ],
  controllers: [
    BookingLifecycleController,
  ],
  providers: [
    PrismaBookingConfirmationTransaction,
    PrismaBookingPendingCreationTransaction,
    {
      provide:
        BOOKING_CONFIRMATION_TRANSACTION,
      useExisting:
        PrismaBookingConfirmationTransaction,
    },
    {
      provide: BOOKING_PENDING_CREATION,
      useExisting: PrismaBookingPendingCreationTransaction,
    },
    SubmitBookingUseCase,
    ConfirmBookingUseCase,
    CancelBookingUseCase,
  ],
  exports: [BOOKING_PENDING_CREATION],
})
export class BookingLifecycleModule {}
