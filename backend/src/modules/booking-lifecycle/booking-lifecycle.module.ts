import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingModule } from '../booking/booking.module';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { SubmitBookingUseCase } from './application/submit-booking.use-case';
import { BookingLifecycleController } from './presentation/booking-lifecycle.controller';

@Module({
  imports: [BookingModule, AvailabilityModule, BusinessModule, ContactModule],
  controllers: [BookingLifecycleController],
  providers: [SubmitBookingUseCase],
})
export class BookingLifecycleModule {}
