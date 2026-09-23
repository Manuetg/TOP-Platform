import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { ACCESS_TOKEN_VERIFIER } from '../../src/modules/identity/domain/access-token-issuer';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { RESOURCE_USAGE_READER, RESOURCE_REPOSITORY } from '../../src/modules/resource/resource.contract';
import { RESOURCE_QUOTA, ResourceLimitReachedError } from '../../src/modules/subscription/subscription.contract';
import { SUBSCRIPTION_REPOSITORY } from '../../src/modules/subscription/application/subscription.repository';

const businessId = '11111111-1111-4111-8111-111111111111', userId = '22222222-2222-4222-8222-222222222222';
let role = MembershipRole.OWNER, active = true, revoked = false;
const get = jest.fn(), upgrade = jest.fn(), count = jest.fn(), allocate = jest.fn(), create = jest.fn(); let app: INestApplication;
const endpoint = `/api/businesses/${businessId}/subscription`;
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ACCESS_TOKEN_VERIFIER).useValue({ verify: () => Promise.resolve({ sub: userId }) })
    .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: () => Promise.resolve({ id: userId, status: 'ACTIVE' }) })
    .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({ findByUserAndBusiness: (_user: string, id: string) => Promise.resolve(!revoked && id === businessId ? { role } : null) })
    .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: () => Promise.resolve({ status: active ? 'ACTIVE' : 'ARCHIVED' }) })
    .overrideProvider(SUBSCRIPTION_REPOSITORY).useValue({ get, requestUpgrade: upgrade })
    .overrideProvider(RESOURCE_REPOSITORY).useValue({ findByBusinessAndCode: () => Promise.resolve(null), create })
    .overrideProvider(RESOURCE_QUOTA).useValue({ allocate })
    .overrideProvider(RESOURCE_USAGE_READER).useValue({ countOperational: count }).compile();
  app = module.createNestApplication(); configureApplication(app); await app.init();
});
afterAll(async () => app.close());
beforeEach(() => { role = MembershipRole.OWNER; active = true; revoked = false; get.mockReset().mockResolvedValue({ plan: { code: 'TOP_INITIAL', name: 'TOP Inicial', maxResources: 10 }, upgradeRequestedAt: null }); upgrade.mockReset().mockResolvedValue({ upgradeRequestedAt: new Date('2026-09-23Z') }); count.mockReset().mockResolvedValue(8); });
it.each(Object.values(MembershipRole))('%s consulta contrato real no-store sin datos del actor', async (value) => {
  role = value; const response = await request(app.getHttpServer()).get(endpoint).set('Authorization', 'Bearer synthetic').expect(200).expect('Cache-Control', 'no-store');
  expect(response.body).toEqual({ subscription: { planCode: 'TOP_INITIAL', planName: 'TOP Inicial' }, entitlements: { maxResources: 10 }, usage: { resources: { used: 8, available: 2, percentage: 80, state: 'WARNING', canCreate: true } }, upgrade: { status: 'AVAILABLE', requestedAt: null } });
});
it.each(Object.values(MembershipRole))('%s solo solicita ampliación si la policy lo permite', async (value) => {
  role = value; const allowed = value === MembershipRole.OWNER;
  await request(app.getHttpServer()).post(`${endpoint}/upgrade-request`).set('Authorization', 'Bearer synthetic').expect(allowed ? 200 : 403);
  if (allowed) expect(upgrade).toHaveBeenCalledWith(businessId, userId); else expect(upgrade).not.toHaveBeenCalled();
});
it('rechaza anónimo, otro tenant y membresía revocada', async () => {
  await request(app.getHttpServer()).get(endpoint).expect(401);
  await request(app.getHttpServer()).get(`/api/businesses/${userId}/subscription`).set('Authorization', 'Bearer synthetic').expect(403);
  revoked = true; await request(app.getHttpServer()).post(`${endpoint}/upgrade-request`).set('Authorization', 'Bearer synthetic').expect(403); expect(get).not.toHaveBeenCalled(); expect(upgrade).not.toHaveBeenCalled();
});
it('rechaza negocio no activo sin consultas de uso', async () => { active = false; await request(app.getHttpServer()).get(endpoint).set('Authorization', 'Bearer synthetic').expect(409); expect(count).not.toHaveBeenCalled(); });
it('no presenta datos parciales si falla el uso', async () => { count.mockRejectedValue(new Error('fallo sintético')); const response = await request(app.getHttpServer()).get(endpoint).set('Authorization', 'Bearer synthetic').expect(500); expect(response.body).not.toHaveProperty('subscription'); });
it('POST Resource devuelve conflicto contractual al alcanzar el cupo sin persistir el alta', async () => {
  allocate.mockRejectedValueOnce(new ResourceLimitReachedError());
  const response = await request(app.getHttpServer()).post(`/api/businesses/${businessId}/resources`).set('Authorization', 'Bearer synthetic').send({ name: 'Cabaña nueva', internalCode: 'NEW', capacityMaximum: 2 }).expect(409);
  expect(response.body).toMatchObject({ code: 'RESOURCE_LIMIT_REACHED' });
  expect(create).not.toHaveBeenCalled();
});
