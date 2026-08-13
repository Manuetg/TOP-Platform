import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusinessModule } from './modules/business/business.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ResourceModule } from './modules/resource/resource.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { HealthService } from './shared/application/health.service';
import { HealthController } from './shared/presentation/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BusinessModule, IdentityModule, ResourceModule, PricingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
