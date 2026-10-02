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
import { CreatePendingBookingUseCase } from './application/create-pending-booking.use-case';
import { PENDING_BOOKING_TRANSACTION } from './pending-booking.contract';
import { PrismaPendingBookingTransaction } from './infrastructure/prisma-pending-booking.transaction';
import { BookingOperationsController } from './presentation/booking-operations.controller';
import { OperateBookingUseCase } from './application/operate-booking.use-case';
import { BOOKING_OPERATION_TRANSACTION } from './booking-operation.contract';
import { PrismaBookingOperationTransaction } from './infrastructure/prisma-booking-operation.transaction';

@Module({
  imports: [
    BookingModule,
    AvailabilityModule,
    BusinessModule,
    ContactModule,
    PricingModule,
    ResourceModule,
  ],
  controllers: [
    BookingLifecycleController,
    BookingOperationsController,
  ],
  providers: [
    PrismaPendingBookingTransaction,
    { provide: PENDING_BOOKING_TRANSACTION, useExisting: PrismaPendingBookingTransaction },
    CreatePendingBookingUseCase,
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
    OperateBookingUseCase,
    PrismaBookingOperationTransaction,
    { provide: BOOKING_OPERATION_TRANSACTION, useExisting: PrismaBookingOperationTransaction },
  ],
})
export class BookingLifecycleModule {}
