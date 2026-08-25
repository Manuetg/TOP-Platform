import { forwardRef, Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { ResourceModule } from '../resource/resource.module';
import { CreateBookingUseCase } from './application/create-booking.use-case';
import { GetBookingUseCase } from './application/get-booking.use-case';
import { ListBookingsUseCase } from './application/list-bookings.use-case';
import { UpdateBookingUseCase } from './application/update-booking.use-case';
import { SubmitBookingUseCase } from './application/submit-booking.use-case';
import { BOOKING_REPOSITORY } from './domain/booking.repository';
import { PrismaBookingRepository } from './infrastructure/prisma-booking.repository';
import { BookingController } from './presentation/booking.controller';
import { BOOKING_AVAILABILITY_LOOKUP } from './booking.contract';

@Module({ imports: [BusinessModule, ContactModule, ResourceModule, forwardRef(() => AvailabilityModule)], controllers: [BookingController], providers: [PrismaBookingRepository, { provide: BOOKING_REPOSITORY, useExisting: PrismaBookingRepository }, {provide:BOOKING_AVAILABILITY_LOOKUP,useExisting:PrismaBookingRepository}, CreateBookingUseCase, GetBookingUseCase, ListBookingsUseCase, UpdateBookingUseCase, SubmitBookingUseCase], exports: [BOOKING_REPOSITORY,BOOKING_AVAILABILITY_LOOKUP] })
export class BookingModule {}
