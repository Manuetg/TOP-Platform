import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ResourceModule } from '../resource/resource.module';
import { CreateRatePlanUseCase } from './application/create-rate-plan.use-case';
import { UpdateRatePlanUseCase } from './application/update-rate-plan.use-case';
import { RATE_PLAN_REPOSITORY } from './domain/rate-plan.repository';
import { PRICING_RESOURCE_LOOKUP } from './domain/resource.lookup';
import { PrismaRatePlanRepository } from './infrastructure/prisma-rate-plan.repository';
import { PricingController } from './presentation/pricing.controller';
import { RESOURCE_REPOSITORY } from '../resource/resource.contract';
@Module({ imports: [BusinessModule, ResourceModule], controllers: [PricingController], providers: [PrismaRatePlanRepository, { provide: RATE_PLAN_REPOSITORY, useExisting: PrismaRatePlanRepository }, { provide: PRICING_RESOURCE_LOOKUP, useExisting: RESOURCE_REPOSITORY }, CreateRatePlanUseCase, UpdateRatePlanUseCase] }) export class PricingModule {}
