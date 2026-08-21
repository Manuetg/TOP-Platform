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
@Module({ imports: [BusinessModule, ResourceModule, BookingModule, BlockModule], controllers: [AvailabilityController, AvailabilityRulesController], providers: [PrismaAvailabilityRulesRepository, { provide: AVAILABILITY_RULES_REPOSITORY, useExisting: PrismaAvailabilityRulesRepository }, CheckAvailabilityUseCase, ListAvailabilityCalendarUseCase, GetAvailabilityRulesUseCase, UpdateAvailabilityRulesUseCase] }) export class AvailabilityModule {}
