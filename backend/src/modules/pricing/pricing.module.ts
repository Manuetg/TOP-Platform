import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import {
  RESOURCE_REPOSITORY,
} from '../resource/resource.contract';
import { ResourceModule } from '../resource/resource.module';
import { ApplyManualPriceOverrideUseCase } from './application/apply-manual-price-override.use-case';
import { CalculatePriceUseCase } from './application/calculate-price.use-case';
import { CreateRatePlanUseCase } from './application/create-rate-plan.use-case';
import { CreateSeasonalRateUseCase } from './application/create-seasonal-rate.use-case';
import { ListSeasonalRatesUseCase } from './application/list-seasonal-rates.use-case';
import { UpdateRatePlanUseCase } from './application/update-rate-plan.use-case';
import { PricingCalculator } from './domain/pricing-calculator';
import {
  PRICING_SNAPSHOT_REPOSITORY,
} from './domain/pricing-snapshot.repository';
import {
  RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP,
} from './domain/rate-plan-resource-assignment.lookup';
import {
  RATE_PLAN_REPOSITORY,
} from './domain/rate-plan.repository';
import {
  PRICING_RESOURCE_LOOKUP,
} from './domain/resource.lookup';
import {
  SEASONAL_RATE_REPOSITORY,
} from './domain/seasonal-rate.repository';
import { PrismaPricingSnapshotRepository } from './infrastructure/prisma-pricing-snapshot.repository';
import { PrismaRatePlanRepository } from './infrastructure/prisma-rate-plan.repository';
import { PrismaSeasonalRateRepository } from './infrastructure/prisma-seasonal-rate.repository';
import { PricingController } from './presentation/pricing.controller';

@Module({
  imports: [
    BusinessModule,
    ResourceModule,
  ],
  controllers: [
    PricingController,
  ],
  providers: [
    PrismaRatePlanRepository,
    PrismaSeasonalRateRepository,
    PrismaPricingSnapshotRepository,
    PricingCalculator,
    {
      provide: RATE_PLAN_REPOSITORY,
      useExisting:
        PrismaRatePlanRepository,
    },
    {
      provide:
        RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP,
      useExisting:
        PrismaRatePlanRepository,
    },
    {
      provide:
        SEASONAL_RATE_REPOSITORY,
      useExisting:
        PrismaSeasonalRateRepository,
    },
    {
      provide: PRICING_RESOURCE_LOOKUP,
      useExisting:
        RESOURCE_REPOSITORY,
    },
    {
      provide:
        PRICING_SNAPSHOT_REPOSITORY,
      useExisting:
        PrismaPricingSnapshotRepository,
    },
    CreateRatePlanUseCase,
    UpdateRatePlanUseCase,
    CreateSeasonalRateUseCase,
    ListSeasonalRatesUseCase,
    CalculatePriceUseCase,
    ApplyManualPriceOverrideUseCase,
  ],
  exports: [
    CalculatePriceUseCase,
    ApplyManualPriceOverrideUseCase,
    PRICING_SNAPSHOT_REPOSITORY,
  ],
})
export class PricingModule {}