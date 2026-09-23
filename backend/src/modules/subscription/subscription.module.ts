import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { ResourceModule } from '../resource/resource.module';
import { SubscriptionCoreModule } from './subscription-core.module';
import { SubscriptionUseCase } from './application/subscription.use-case';
import { SubscriptionController } from './presentation/subscription.controller';

@Module({ imports: [BusinessModule, ResourceModule, SubscriptionCoreModule], providers: [SubscriptionUseCase], controllers: [SubscriptionController] })
export class SubscriptionModule {}
