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
import { SeasonalRate } from '../../src/modules/pricing/domain/seasonal-rate.entity';
import { SEASONAL_RATE_REPOSITORY, type CreateSeasonalRateData } from '../../src/modules/pricing/domain/seasonal-rate.repository';
import { RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP } from '../../src/modules/pricing/domain/rate-plan-resource-assignment.lookup';
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
  let app: INestApplication; let currentBusiness: Business | null; let currentPlan: RatePlan | null; let resources: Resource[]; let seasons: SeasonalRate[]; let assigned: boolean;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: () => Promise.resolve(currentBusiness), create: jest.fn(), list: jest.fn(), update: jest.fn() })
      .overrideProvider(RESOURCE_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(resources.find((item) => item.id === id && item.businessId === owner) ?? null), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() })
      .overrideProvider(RATE_PLAN_REPOSITORY).useValue({ create: () => Promise.resolve(rate()), findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(id === planId && owner === businessId ? currentPlan : null), update: (data: UpdateRatePlanData) => Promise.resolve(RatePlan.create({ ...data, status: currentPlan?.status ?? RatePlanStatus.ACTIVE, resources: (data.resourceIds ?? currentPlan?.resources.map((item) => item.id) ?? []).map((id) => ({ id, name: 'Cabana', internalCode: 'CAB-33' })), createdAt: currentPlan?.createdAt ?? new Date(), updatedAt: new Date() })) })
      .overrideProvider(SEASONAL_RATE_REPOSITORY).useValue({
        create: (data: CreateSeasonalRateData) => {
          const created = SeasonalRate.create({ id: `66666666-6666-4666-8666-${String(seasons.length + 1).padStart(12, '0')}`, ...data, createdAt: new Date(), updatedAt: new Date() });
          seasons.push(created); return Promise.resolve(created);
        },
        listByRatePlanId: (id: string) => Promise.resolve(seasons.filter((season) => season.ratePlanId === id).sort((left, right) => left.startDate.localeCompare(right.startDate))),
        listIntersectingRange: (id: string, checkIn: string, checkOut: string) => Promise.resolve(seasons.filter((season) => season.ratePlanId === id && season.startDate < checkOut && season.endDate > checkIn)),
        hasOverlap: (id: string, startDate: string, endDate: string) => Promise.resolve(seasons.some((season) => season.ratePlanId === id && season.startDate < endDate && season.endDate > startDate)),
        hasOutsideValidity: (id: string, validFrom: string | null, validTo: string | null) => Promise.resolve(seasons.some((season) => season.ratePlanId === id && ((validFrom !== null && season.startDate < validFrom) || (validTo !== null && season.endDate > validTo)))),
      })
      .overrideProvider(RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP).useValue({ isAssigned: () => Promise.resolve(assigned) })
      .compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { currentBusiness = business(); currentPlan = rate(); resources = [resource(resourceId), resource(archivedResourceId, businessId, ResourceStatus.ARCHIVED), resource(foreignResourceId, otherBusinessId)]; seasons = []; assigned = true; });
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
  it.each([
    { startDate: '2026-02-30', endDate: '2026-03-10' },
    { startDate: '2026-04-01', endDate: '2026-04-31' },
  ])('returns 400 instead of 500 for an invalid seasonal calendar date', async (dates) => {
    await request(app.getHttpServer())
      .post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`)
      .send({ name: 'Temporada inválida', amountMinor: 650000, ...dates })
      .expect(400);
  });
  it('creates, lists and exposes seasonal rates through a public DTO', async () => {
    const first = { name: 'Navidad', amountMinor: 650000, startDate: '2026-10-01', endDate: '2026-10-10' };
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send(first).expect(201).expect(({ body }: { body: Record<string, unknown> }) => { expect(body).toMatchObject({ name: 'Navidad', currency: 'PYG' }); expect(body).not.toHaveProperty('props'); });
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ ...first, name: 'Feriado', startDate: '2026-10-10', endDate: '2026-10-15' }).expect(201);
    await request(app.getHttpServer()).get(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).expect(200).expect(({ body }: { body: Array<{ name: string }> }) => expect(body.map((item) => item.name)).toEqual(['Navidad', 'Feriado']));
  });
  it.each([
    [{ name: 'A', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-02' }, 400],
    [{ name: 'Normal', amountMinor: 0, startDate: '2026-10-01', endDate: '2026-10-02' }, 400],
    [{ name: 'Normal', amountMinor: 1, startDate: '2026-10-02', endDate: '2026-10-02' }, 400],
  ])('rejects invalid seasonal POST input', async (body, status) => request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send(body).expect(status));
  it('returns expected seasonal business, plan and overlap errors', async () => {
    await request(app.getHttpServer()).post('/api/businesses/invalid/rate-plans/invalid/seasonal-rates').send({ name: 'Normal', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-02' }).expect(400);
    currentBusiness = null; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Normal', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-02' }).expect(404);
    currentBusiness = business(BusinessStatus.ARCHIVED); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Normal', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-02' }).expect(409);
    currentBusiness = business(); currentPlan = null; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Normal', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-02' }).expect(404);
    currentPlan = rate(RatePlanStatus.ARCHIVED); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Normal', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-02' }).expect(409);
    currentPlan = rate(); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'First', amountMinor: 1, startDate: '2026-10-01', endDate: '2026-10-10' }).expect(201);
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Overlap', amountMinor: 1, startDate: '2026-10-05', endDate: '2026-10-11' }).expect(409);
  });
  it('rejects a RatePlan PATCH that would exclude an existing seasonal rate', async () => {
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Navidad', amountMinor: 650000, startDate: '2026-10-10', endDate: '2026-10-20' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId}`).send({ validTo: '2026-10-15' }).expect(409);
  });
  it('calculates a public nightly breakdown without persisting it', async () => {
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Navidad', amountMinor: 650000, startDate: '2026-08-20', endDate: '2026-08-26' }).expect(201);
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(200).expect(({ body }: { body: { nights: number; totalAmountMinor: number; breakdown: Array<{ source: string }> } }) => { expect(body.nights).toBe(4); expect(body.totalAmountMinor).toBe(2200000); expect(body.breakdown.map((night) => night.source)).toEqual(['BASE', 'BASE', 'SEASONAL', 'SEASONAL']); expect(body).not.toHaveProperty('props'); });
  });
  it.each([
    [2000000, -200000],
    [2200000, 0],
    [2400000, 200000],
    [0, -2200000],
  ])('applies a manual agreed total while retaining the server-side suggested breakdown', async (agreedAmountMinor, adjustmentAmountMinor) => {
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/seasonal-rates`).send({ name: 'Navidad', amountMinor: 650000, startDate: '2026-08-20', endDate: '2026-08-26' }).expect(201);
    await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22', agreedAmountMinor, overrideReason: ' Descuento comercial ' }).expect(200).expect(({ body }: { body: { pricingMode: string; suggestedAmountMinor: number; agreedAmountMinor: number; adjustmentAmountMinor: number; overrideReason: string; breakdown?: unknown; suggestedBreakdown: Array<{ source: string }> } }) => {
      expect(body).toMatchObject({ pricingMode: 'MANUAL_OVERRIDE', suggestedAmountMinor: 2200000, agreedAmountMinor, adjustmentAmountMinor, overrideReason: 'Descuento comercial' });
      expect(body.suggestedBreakdown.map((night) => night.source)).toEqual(['BASE', 'BASE', 'SEASONAL', 'SEASONAL']); expect(body).not.toHaveProperty('props'); expect(body).not.toHaveProperty('breakdown');
    });
  });
  it.each([
    [{ resourceId, checkIn: '2026-02-30', checkOut: '2026-08-22', agreedAmountMinor: 1, overrideReason: 'Motivo válido' }, 400],
    [{ resourceId, checkIn: '2026-08-22', checkOut: '2026-08-22', agreedAmountMinor: 1, overrideReason: 'Motivo válido' }, 400],
    [{ resourceId, checkIn: '2026-01-01', checkOut: '2027-01-02', agreedAmountMinor: 1, overrideReason: 'Motivo válido' }, 400],
    [{ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22', agreedAmountMinor: -1, overrideReason: 'Motivo válido' }, 400],
    [{ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22', agreedAmountMinor: 1, overrideReason: ' ' }, 400],
    [{ resourceId: foreignResourceId, checkIn: '2026-08-18', checkOut: '2026-08-22', agreedAmountMinor: 1, overrideReason: 'Motivo válido' }, 404],
  ])('validates manual overrides and preserves tenant isolation', async (body, status) => request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send(body).expect(status));
  it('inherits calculation operational conflicts for manual overrides', async () => {
    const body = { resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22', agreedAmountMinor: 1, overrideReason: 'Motivo válido' };
    currentBusiness = business(BusinessStatus.ARCHIVED); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send(body).expect(409);
    currentBusiness = business(); resources = [resource(resourceId, businessId, ResourceStatus.OUT_OF_SERVICE)]; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send(body).expect(409);
    resources = [resource(resourceId)]; currentPlan = rate(RatePlanStatus.ARCHIVED); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send(body).expect(409);
    currentPlan = rate(); assigned = false; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send(body).expect(409);
    assigned = true; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate/override`).send({ ...body, checkIn: '2026-07-30', checkOut: '2026-08-02' }).expect(409);
  });
  it.each([
    ['invalid', planId, { resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }, 400],
    [businessId, 'invalid', { resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }, 400],
    [businessId, planId, { resourceId: 'invalid', checkIn: '2026-08-18', checkOut: '2026-08-22' }, 400],
    [businessId, planId, { resourceId, checkIn: '2026-02-30', checkOut: '2026-08-22' }, 400],
    [businessId, planId, { resourceId, checkIn: '2026-08-22', checkOut: '2026-08-22' }, 400],
    [businessId, planId, { resourceId, checkIn: '2026-01-01', checkOut: '2027-01-02' }, 400],
  ])('validates calculate input', async (owner, plan, body, status) => request(app.getHttpServer()).post(`/api/businesses/${owner}/rate-plans/${plan}/calculate`).send(body).expect(status));
  it('returns expected calculate scope and operational conflicts', async () => {
    currentBusiness = null; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(404);
    currentBusiness = business(BusinessStatus.ARCHIVED); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(409);
    currentBusiness = business(); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId: foreignResourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(404);
    resources = [resource(resourceId, businessId, ResourceStatus.OUT_OF_SERVICE)]; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(409);
  });
  it('rejects archived, unassigned and out-of-validity RatePlan calculations', async () => {
    currentPlan = rate(RatePlanStatus.ARCHIVED); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(409);
    currentPlan = rate(); assigned = false; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-08-18', checkOut: '2026-08-22' }).expect(409);
    assigned = true; await request(app.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId}/calculate`).send({ resourceId, checkIn: '2026-07-30', checkOut: '2026-08-02' }).expect(409);
  });
});
