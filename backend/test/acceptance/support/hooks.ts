import { After, Before } from '@cucumber/cucumber';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApplication } from '../../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../../src/modules/business/domain/business.repository';
import { businessRepositoryFake, resetBusinessRepositoryFake } from './business-repository.fake';
import { TopWorld } from './world';

Before(async function (this: TopWorld) {
  resetBusinessRepositoryFake();
  const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(BUSINESS_REPOSITORY).useValue(businessRepositoryFake).compile();
  this.app = module.createNestApplication();
  configureApplication(this.app);
  await this.app.init();
});

After(async function (this: TopWorld) {
  await this.app?.close();
});
