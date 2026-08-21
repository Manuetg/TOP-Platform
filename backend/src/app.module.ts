import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusinessModule } from './modules/business/business.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ResourceModule } from './modules/resource/resource.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { ContactModule } from './modules/contact/contact.module';
import { BlockModule } from './modules/block/block.module';
import { HealthService } from './shared/application/health.service';
import { HealthController } from './shared/presentation/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BusinessModule, IdentityModule, ResourceModule, PricingModule, ContactModule, BlockModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
