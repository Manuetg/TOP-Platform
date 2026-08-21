import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ResourceModule } from '../resource/resource.module';
import { BookingModule } from '../booking/booking.module';
import { BlockModule } from '../block/block.module';
import { AvailabilityController } from './presentation/availability.controller';
import { CheckAvailabilityUseCase } from './application/check-availability.use-case';
@Module({ imports: [BusinessModule, ResourceModule, BookingModule, BlockModule], controllers: [AvailabilityController], providers: [CheckAvailabilityUseCase] }) export class AvailabilityModule {}
