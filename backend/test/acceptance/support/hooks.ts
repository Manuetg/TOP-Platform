import { After, Before } from '@cucumber/cucumber';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApplication } from '../../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../../src/modules/business/domain/business.repository';
import { PASSWORD_HASHER } from '../../../src/modules/identity/domain/password-hasher';
import { USER_REPOSITORY } from '../../../src/modules/identity/domain/user.repository';
import { BUSINESS_LOOKUP, MEMBERSHIP_REPOSITORY, USER_LOOKUP } from '../../../src/modules/identity/domain/membership.repository';
import { businessRepositoryFake, resetBusinessRepositoryFake } from './business-repository.fake';
import { passwordHasherFake, resetUserRepositoryFake, userRepositoryFake } from './user-repository.fake';
import { businessLookupFake, membershipRepositoryFake, resetMembershipFakes, userLookupFake } from './membership-repository.fake';
import { TopWorld } from './world';

Before(async function (this: TopWorld) {
  resetBusinessRepositoryFake();
  resetUserRepositoryFake();
  resetMembershipFakes();
  const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BUSINESS_REPOSITORY).useValue(businessRepositoryFake)
    .overrideProvider(USER_REPOSITORY).useValue(userRepositoryFake)
    .overrideProvider(PASSWORD_HASHER).useValue(passwordHasherFake)
    .overrideProvider(MEMBERSHIP_REPOSITORY).useValue(membershipRepositoryFake)
    .overrideProvider(USER_LOOKUP).useValue(userLookupFake)
    .overrideProvider(BUSINESS_LOOKUP).useValue(businessLookupFake)
    .compile();
  this.app = module.createNestApplication();
  configureApplication(this.app);
  await this.app.init();
});

After(async function (this: TopWorld) {
  await this.app?.close();
});
