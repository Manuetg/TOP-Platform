import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusinessModule } from './modules/business/business.module';
import { HealthService } from './shared/application/health.service';
import { HealthController } from './shared/presentation/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), BusinessModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
