import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ResourceModule } from '../resource/resource.module';
import { BookingModule } from '../booking/booking.module';
import { BlockModule } from '../block/block.module';
import { AvailabilityController } from './presentation/availability.controller';
import { CheckAvailabilityUseCase } from './application/check-availability.use-case';
import { ListAvailabilityCalendarUseCase } from './application/list-availability-calendar.use-case';
import { PrismaAvailabilityRulesRepository } from './infrastructure/prisma-availability-rules.repository';
import { AVAILABILITY_RULES_REPOSITORY } from './domain/availability-rules.repository';
import { GetAvailabilityRulesUseCase, UpdateAvailabilityRulesUseCase } from './application/availability-rules.use-cases';
import { AvailabilityRulesController } from './presentation/availability-rules.controller';
import { ValidateOverbookingUseCase } from './application/validate-overbooking.use-case';
import { AVAILABILITY_OVERBOOKING_VALIDATOR, OCCUPANCY_PROJECTION_READER } from './availability.contract';
import { PrismaOccupancyProjectionReader } from './infrastructure/prisma-occupancy-projection.reader';

@Module({ imports: [BusinessModule, ResourceModule, BookingModule, BlockModule], controllers: [AvailabilityController, AvailabilityRulesController], providers: [PrismaAvailabilityRulesRepository, PrismaOccupancyProjectionReader, { provide: AVAILABILITY_RULES_REPOSITORY, useExisting: PrismaAvailabilityRulesRepository }, { provide: OCCUPANCY_PROJECTION_READER, useExisting: PrismaOccupancyProjectionReader }, CheckAvailabilityUseCase, ListAvailabilityCalendarUseCase, GetAvailabilityRulesUseCase, UpdateAvailabilityRulesUseCase, ValidateOverbookingUseCase, { provide: AVAILABILITY_OVERBOOKING_VALIDATOR, useExisting: ValidateOverbookingUseCase }], exports: [AVAILABILITY_OVERBOOKING_VALIDATOR, OCCUPANCY_PROJECTION_READER] }) export class AvailabilityModule {}
