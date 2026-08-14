import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { RatePlan } from '../../src/modules/pricing/domain/rate-plan.entity';
import { RATE_PLAN_REPOSITORY, type UpdateRatePlanData } from '../../src/modules/pricing/domain/rate-plan.repository';
import { RatePlanStatus } from '../../src/modules/pricing/domain/rate-plan-status.enum';
import { Resource } from '../../src/modules/resource/domain/resource.entity';
import { RESOURCE_REPOSITORY } from '../../src/modules/resource/domain/resource.repository';
import { ResourceStatus } from '../../src/modules/resource/domain/resource-status.enum';

const businessId = '11111111-1111-4111-8111-111111111111';
const otherBusinessId = '12111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const archivedResourceId = '44444444-4444-4444-8444-444444444444';
const foreignResourceId = '55555555-5555-4555-8555-555555555555';
const business = (status = BusinessStatus.ACTIVE) => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date(), updatedAt: new Date() });
const resource = (id: string, owner = businessId, status = ResourceStatus.ACTIVE) => Resource.create({ id, businessId: owner, name: 'Cabana', internalCode: `CAB-${id.slice(0, 2)}`, description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
const rate = (status = RatePlanStatus.ACTIVE) => RatePlan.create({ id: planId, businessId, name: 'Plan', description: 'Old', baseNightlyAmountMinor: 450000, currency: 'PYG', status, validFrom: '2026-08-01', validTo: '2026-12-01', resources: [], createdAt: new Date(), updatedAt: new Date() });

describe('Pricing endpoint', () => {
  let app: INestApplication; let currentBusiness: Business | null; let currentPlan: RatePlan | null; let resources: Resource[];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: () => Promise.resolve(currentBusiness), create: jest.fn(), list: jest.fn(), update: jest.fn() })
      .overrideProvider(RESOURCE_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(resources.find((item) => item.id === id && item.businessId === owner) ?? null), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() })
      .overrideProvider(RATE_PLAN_REPOSITORY).useValue({ create: () => Promise.resolve(rate()), findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(id === planId && owner === businessId ? currentPlan : null), update: (data: UpdateRatePlanData) => Promise.resolve(RatePlan.create({ ...data, status: currentPlan?.status ?? RatePlanStatus.ACTIVE, resources: (data.resourceIds ?? currentPlan?.resources.map((item) => item.id) ?? []).map((id) => ({ id, name: 'Cabana', internalCode: 'CAB-33' })), createdAt: currentPlan?.createdAt ?? new Date(), updatedAt: new Date() })) })
      .compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { currentBusiness = business(); currentPlan = rate(); resources = [resource(resourceId), resource(archivedResourceId, businessId, ResourceStatus.ARCHIVED), resource(foreignResourceId, otherBusinessId)]; });
  it('actualiza parcialmente y expone DTO público', async () => {
    await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ baseNightlyAmountMinor: 500000 }).expect(200).expect(({ body }: { body: Record<string, unknown> }) => { expect(body).toMatchObject({ id: planId, baseNightlyAmountMinor: 500000, name: 'Plan', currency: 'PYG' }); expect(body).not.toHaveProperty('props'); });
  });
  it.each([{}, { name: ' ' }, { baseNightlyAmountMinor: 0 }, { validFrom: '2026-12-01' }, { resourceIds: [resourceId, resourceId] }])('rechaza PATCH inválido', async (body) => request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send(body).expect(400));
  it('permite asignar un Resource OUT_OF_SERVICE', async () => {
    resources = [resource(resourceId, businessId, ResourceStatus.OUT_OF_SERVICE)];
    await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ resourceIds: [resourceId] }).expect(200).expect(({ body }: { body: { resources: Array<{ id: string }> } }) => expect(body.resources).toEqual([expect.objectContaining({ id: resourceId })]));
  });
  it.each([[archivedResourceId, 409], [foreignResourceId, 404]])('rejects archived or foreign Resources without revealing ownership', async (id, status) => request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ resourceIds: [id] }).expect(status));
  it('traduce ausencias y archivados', async () => {
    currentBusiness = null; await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ name: 'Next' }).expect(404);
    currentBusiness = business(BusinessStatus.ARCHIVED); await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ name: 'Next' }).expect(409);
    currentBusiness = business(); currentPlan = rate(RatePlanStatus.ARCHIVED); await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ name: 'Next' }).expect(409);
  });
});
