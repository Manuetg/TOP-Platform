import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { HealthService } from '../../src/shared/application/health.service';
import { HealthController } from '../../src/shared/presentation/health.controller';

describe('Health module', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('resuelve el controlador y el servicio juntos', () => {
    const controller = module.get(HealthController);
    const service = module.get(HealthService);

    expect(controller.check()).toEqual(service.check());
  });
});
