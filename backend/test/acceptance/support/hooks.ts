import { After, Before } from '@cucumber/cucumber';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApplication } from '../../../src/config/configure-application';
import { PrismaBusinessRepository } from '../../../src/modules/business/infrastructure/prisma-business.repository';
import { businessRepositoryFake } from './business-repository.fake';
import { TopWorld } from './world';

Before(async function (this: TopWorld) {
  const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaBusinessRepository).useValue(businessRepositoryFake).compile();
  this.app = module.createNestApplication();
  configureApplication(this.app);
  await this.app.init();
});

After(async function (this: TopWorld) {
  await this.app?.close();
});
