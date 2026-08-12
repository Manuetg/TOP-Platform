import { After, Before } from '@cucumber/cucumber';
import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { configureApplication } from '../../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../../src/modules/business/domain/business.repository';
import { PASSWORD_HASHER } from '../../../src/modules/identity/domain/password-hasher';
import { AUTHENTICATION_REPOSITORY } from '../../../src/modules/identity/domain/authentication.repository';
import { ACCESS_TOKEN_ISSUER } from '../../../src/modules/identity/domain/access-token-issuer';
import { REFRESH_SESSION_REPOSITORY } from '../../../src/modules/identity/domain/refresh-session.repository';
import { REFRESH_TOKEN_EXPIRATION, REFRESH_TOKEN_GENERATOR, REFRESH_TOKEN_HASHER } from '../../../src/modules/identity/domain/refresh-token';
import { USER_BY_ID_LOOKUP } from '../../../src/modules/identity/domain/user-by-id.lookup';
import { USER_STATUS_REPOSITORY } from '../../../src/modules/identity/domain/user-status.repository';
import { USER_REPOSITORY } from '../../../src/modules/identity/domain/user.repository';
import { RefreshSession } from '../../../src/modules/identity/domain/refresh-session.entity';
import { BUSINESS_LOOKUP, MEMBERSHIP_REPOSITORY, USER_LOOKUP } from '../../../src/modules/identity/domain/membership.repository';
import { businessRepositoryFake, resetBusinessRepositoryFake } from './business-repository.fake';
import { authenticationRepositoryFake, passwordHasherFake, resetUserRepositoryFake, userByIdLookupFake, userRepositoryFake, userStatusRepositoryFake } from './user-repository.fake';
import { businessLookupFake, membershipRepositoryFake, resetMembershipFakes, userLookupFake } from './membership-repository.fake';
import { TopWorld } from './world';
import { RESOURCE_REPOSITORY } from '../../../src/modules/resource/domain/resource.repository';
import { resetResourceRepositoryFake, resourceRepositoryFake } from './resource-repository.fake';
import { FILE_STORAGE } from '../../../src/modules/resource/domain/file-storage.port';
import { RESOURCE_IMAGE_REPOSITORY } from '../../../src/modules/resource/domain/resource-image.repository';
import { InMemoryFileStorage } from '../../../src/modules/resource/infrastructure/in-memory-file-storage';
import { resetResourceImageRepositoryFake, resourceImageRepositoryFake } from './resource-image-repository.fake';
import { AMENITY_REPOSITORY } from '../../../src/modules/resource/domain/amenity.repository';
import { RESOURCE_AMENITY_REPOSITORY } from '../../../src/modules/resource/domain/resource-amenity.repository';
import { amenityRepositoryFake, resetAmenityFakes, resourceAmenityRepositoryFake } from './amenity-repository.fake';

Before(async function (this: TopWorld) {
  resetBusinessRepositoryFake();
  resetUserRepositoryFake();
  resetMembershipFakes();
  resetResourceRepositoryFake();
  resetResourceImageRepositoryFake();
  resetAmenityFakes();
  const refreshSessions = new Map<string, RefreshSession>();
  const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(BUSINESS_REPOSITORY).useValue(businessRepositoryFake)
    .overrideProvider(RESOURCE_REPOSITORY).useValue(resourceRepositoryFake)
    .overrideProvider(RESOURCE_IMAGE_REPOSITORY).useValue(resourceImageRepositoryFake)
    .overrideProvider(AMENITY_REPOSITORY).useValue(amenityRepositoryFake)
    .overrideProvider(RESOURCE_AMENITY_REPOSITORY).useValue(resourceAmenityRepositoryFake)
    .overrideProvider(FILE_STORAGE).useValue(new InMemoryFileStorage())
    .overrideProvider(USER_REPOSITORY).useValue(userRepositoryFake)
    .overrideProvider(AUTHENTICATION_REPOSITORY).useValue(authenticationRepositoryFake)
    .overrideProvider(PASSWORD_HASHER).useValue(passwordHasherFake)
    .overrideProvider(ACCESS_TOKEN_ISSUER).useValue({ issue: (payload: { sub: string }) => Promise.resolve({ token: `token:${payload.sub}`, expiresIn: 900 }) })
    .overrideProvider(REFRESH_SESSION_REPOSITORY).useValue({
      create: (data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshSession> => {
        const session = RefreshSession.create({ id: `session-${refreshSessions.size + 1}`, ...data, revokedAt: null, replacedBySessionId: null, createdAt: new Date(), updatedAt: new Date() });
        refreshSessions.set(session.tokenHash, session);
        return Promise.resolve(session);
      },
      findByTokenHash: (tokenHash: string): Promise<RefreshSession | null> => Promise.resolve(refreshSessions.get(tokenHash) ?? null),
      revokeByTokenHash: (): Promise<void> => Promise.resolve(),
      rotate: (): Promise<void> => Promise.resolve(),
    })
    .overrideProvider(REFRESH_TOKEN_GENERATOR).useValue({ generate: () => 'refresh-token' })
    .overrideProvider(REFRESH_TOKEN_HASHER).useValue({ hash: (token: string) => `hash:${token}` })
    .overrideProvider(REFRESH_TOKEN_EXPIRATION).useValue({ expiresAt: () => new Date('2027-02-01') })
    .overrideProvider(USER_BY_ID_LOOKUP).useValue(userByIdLookupFake)
    .overrideProvider(USER_STATUS_REPOSITORY).useValue(userStatusRepositoryFake)
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
