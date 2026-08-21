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

@Module({ imports: [BusinessModule, ContactModule, ResourceModule], controllers: [BookingController], providers: [PrismaBookingRepository, { provide: BOOKING_REPOSITORY, useExisting: PrismaBookingRepository }, CreateBookingUseCase, GetBookingUseCase, ListBookingsUseCase, UpdateBookingUseCase], exports: [BOOKING_REPOSITORY] })
export class BookingModule {}
