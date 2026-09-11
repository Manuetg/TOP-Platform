import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ContactModule } from '../contact/contact.module';
import { ResourceModule } from '../resource/resource.module';
import { CreateBookingUseCase } from './application/create-booking.use-case';
import { GetBookingUseCase } from './application/get-booking.use-case';
import { ListBookingsUseCase } from './application/list-bookings.use-case';
import { UpdateBookingUseCase } from './application/update-booking.use-case';
import { BOOKING_REPOSITORY } from './domain/booking.repository';
import { PrismaBookingRepository } from './infrastructure/prisma-booking.repository';
import { BookingController } from './presentation/booking.controller';
import {
  BOOKING_AVAILABILITY_LOOKUP,
  BOOKING_TIMELINE_REPOSITORY,
  RESERVATIONS_PROJECTION_READER,
} from './booking.contract';
import { PrismaBookingTimelineRepository } from './infrastructure/prisma-booking-timeline.repository';
import { ListBookingTimelineUseCase } from './application/list-booking-timeline.use-case';
import { PrismaReservationsProjectionReader } from './infrastructure/prisma-reservations-projection.reader';

@Module({ imports: [BusinessModule, ContactModule, ResourceModule], controllers: [BookingController], providers: [PrismaBookingRepository, PrismaBookingTimelineRepository, PrismaReservationsProjectionReader, { provide: BOOKING_REPOSITORY, useExisting: PrismaBookingRepository }, {provide:BOOKING_AVAILABILITY_LOOKUP,useExisting:PrismaBookingRepository}, {provide:BOOKING_TIMELINE_REPOSITORY,useExisting:PrismaBookingTimelineRepository}, {provide:RESERVATIONS_PROJECTION_READER,useExisting:PrismaReservationsProjectionReader}, CreateBookingUseCase, GetBookingUseCase, ListBookingsUseCase, UpdateBookingUseCase, ListBookingTimelineUseCase], exports: [BOOKING_REPOSITORY,BOOKING_AVAILABILITY_LOOKUP,BOOKING_TIMELINE_REPOSITORY,RESERVATIONS_PROJECTION_READER] })
export class BookingModule {}
