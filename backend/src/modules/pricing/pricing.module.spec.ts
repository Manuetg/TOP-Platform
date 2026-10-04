import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AVAILABILITY_QUERY } from '../availability/availability.contract';
import { AvailabilityModule } from '../availability/availability.module';
import { ListAvailableResourcesUseCase } from '../availability/application/list-available-resources.use-case';
import { PricingQuoteUseCase } from './application/pricing-quote.use-case';
import { PRICING_QUOTE } from './pricing.contract';
import { PricingModule } from './pricing.module';

describe('PricingModule wiring', () => {
  it('registra los contratos públicos como alias de sus casos de uso existentes', async () => {
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://top:top@localhost:5432/top_test?schema=public' })] }), PricingModule, AvailabilityModule] }).compile();

    expect(module.get(PRICING_QUOTE)).toBe(module.get(PricingQuoteUseCase));
    expect(module.get(AVAILABILITY_QUERY)).toBe(module.get(ListAvailableResourcesUseCase));

    await module.close();
  });
});
