import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { RESOURCE_QUOTA } from './application/resource-quota';
import { SUBSCRIPTION_REPOSITORY } from './application/subscription.repository';
import { PrismaSubscriptionRepository } from './infrastructure/prisma-subscription.repository';

@Module({ imports: [BusinessModule], providers: [PrismaSubscriptionRepository, { provide: RESOURCE_QUOTA, useExisting: PrismaSubscriptionRepository }, { provide: SUBSCRIPTION_REPOSITORY, useExisting: PrismaSubscriptionRepository }], exports: [RESOURCE_QUOTA, SUBSCRIPTION_REPOSITORY] })
export class SubscriptionCoreModule {}
