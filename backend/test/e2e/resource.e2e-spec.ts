import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { Resource } from '../../src/modules/resource/domain/resource.entity';
import { RESOURCE_REPOSITORY } from '../../src/modules/resource/domain/resource.repository';
import { ResourceStatus } from '../../src/modules/resource/domain/resource-status.enum';

const businessA = '11111111-1111-4111-8111-111111111111';
const businessB = '22222222-2222-4222-8222-222222222222';
const resourceA = '33333333-3333-4333-8333-333333333333';
const resourceB = '44444444-4444-4444-8444-444444444444';
const makeBusiness = (id: string, status = BusinessStatus.ACTIVE): Business => Business.create({ id, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status, createdAt: new Date('2026-08-04T00:00:00.000Z'), updatedAt: new Date('2026-08-04T00:00:00.000Z') });
const makeResource = (status: ResourceStatus, id = resourceA, businessId = businessA): Resource => Resource.create({ id, businessId, name: 'Cabaña Norte', internalCode: 'CAB-NORTE', description: null, capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 0, createdAt: new Date('2026-08-04T00:00:00.000Z'), updatedAt: new Date('2026-08-04T00:00:00.000Z') });

describe('Resource endpoint', () => {
  let app: INestApplication;
  let businesses: Business[];
  let resources: Resource[];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: (id: string): Promise<Business | null> => Promise.resolve(businesses.find((item) => item.id === id) ?? null), create: jest.fn(), list: jest.fn(), update: jest.fn() })
      .overrideProvider(RESOURCE_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, businessId: string): Promise<Resource | null> => Promise.resolve(resources.find((item) => item.id === id && item.businessId === businessId) ?? null), listByBusinessId: (businessId: string): Promise<Resource[]> => Promise.resolve(resources.filter((item) => item.businessId === businessId)), findByBusinessAndCode: (businessId: string, internalCode: string): Promise<Resource | null> => Promise.resolve(resources.find((item) => item.businessId === businessId && item.internalCode === internalCode) ?? null), create: jest.fn(), update: (resource: Resource): Promise<Resource> => { resources = resources.map((item) => item.id === resource.id ? resource : item); return Promise.resolve(resource); } }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { businesses = [makeBusiness(businessA), makeBusiness(businessB)]; resources = [makeResource(ResourceStatus.ACTIVE), makeResource(ResourceStatus.ACTIVE, resourceB, businessB)]; });
  it.each([ResourceStatus.ACTIVE, ResourceStatus.OUT_OF_SERVICE, ResourceStatus.ARCHIVED])('retorna 200 para Resource %s sin propiedades internas', async (status) => { resources = [makeResource(status)]; await request(app.getHttpServer()).get(`/api/businesses/${businessA}/resources/${resourceA}`).expect(200).expect(({ body }: { body: Record<string, unknown> }) => { expect(body.status).toBe(status); expect(body).toMatchObject({ id: resourceA, businessId: businessA, internalCode: 'CAB-NORTE' }); expect(body).not.toHaveProperty('props'); }); });
  it('retorna 200 si el Business está archivado', async () => { businesses = [makeBusiness(businessA, BusinessStatus.ARCHIVED)]; await request(app.getHttpServer()).get(`/api/businesses/${businessA}/resources/${resourceA}`).expect(200); });
  it.each(['/api/businesses/invalido/resources/33333333-3333-4333-8333-333333333333', '/api/businesses/11111111-1111-4111-8111-111111111111/resources/invalido'])('retorna 400 con UUID inválido', async (url) => { await request(app.getHttpServer()).get(url).expect(400); });
  it.each(['/api/businesses/55555555-5555-4555-8555-555555555555/resources/33333333-3333-4333-8333-333333333333', '/api/businesses/11111111-1111-4111-8111-111111111111/resources/55555555-5555-4555-8555-555555555555', `/api/businesses/${businessA}/resources/${resourceB}`])('retorna 404 cuando la referencia no pertenece al tenant o no existe', async (url) => { await request(app.getHttpServer()).get(url).expect(404); });
  it('lista Resources del Business en orden público y devuelve vacío, 400 y 404 cuando corresponde', async () => { resources = [makeResource(ResourceStatus.ARCHIVED, resourceB, businessA), makeResource(ResourceStatus.ACTIVE, resourceA, businessA)]; await request(app.getHttpServer()).get(`/api/businesses/${businessA}/resources`).expect(200).expect(({ body }: { body: Array<Record<string, unknown>> }) => { expect(body).toHaveLength(2); expect(body.every((resource) => !('props' in resource))).toBe(true); }); await request(app.getHttpServer()).get(`/api/businesses/${businessB}/resources`).expect(200).expect([]); await request(app.getHttpServer()).get('/api/businesses/invalid/resources').expect(400); await request(app.getHttpServer()).get('/api/businesses/55555555-5555-4555-8555-555555555555/resources').expect(404); });
  it('actualiza parcialmente, normaliza y no expone props', async () => { await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}`).send({ name: ' Cabaña Sur ', internalCode: ' sur-1 ', description: '' }).expect(200).expect(({ body }: { body: Record<string, unknown> }) => { expect(body).toMatchObject({ name: 'Cabaña Sur', internalCode: 'SUR-1', description: null, status: ResourceStatus.ACTIVE }); expect(body).not.toHaveProperty('props'); }); });
  it.each([{},{ capacityMaximum: 0 }, { name: ' ' }, { internalCode: '!' }, { sortOrder: 10000 }])('rechaza PATCH inválido', async (body) => { await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}`).send(body).expect(400); });
  it('rechaza PATCH sobre Business o Resource archivados y preserva el aislamiento', async () => { businesses = [makeBusiness(businessA, BusinessStatus.ARCHIVED)]; await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}`).send({ name: 'Nueva' }).expect(409); businesses = [makeBusiness(businessA), makeBusiness(businessB)]; resources = [makeResource(ResourceStatus.ARCHIVED)]; await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}`).send({ name: 'Nueva' }).expect(409); resources = [makeResource(ResourceStatus.ACTIVE, resourceB, businessB)]; await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceB}`).send({ name: 'Nueva' }).expect(404); });

  it('deshabilita un Resource, es idempotente y protege el tenant', async () => {
    const first = await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}/disable`).expect(200);
    expect(first.body).toMatchObject({ id: resourceA, status: ResourceStatus.OUT_OF_SERVICE });
    expect(first.body).not.toHaveProperty('props');
    const timestamp = first.body.updatedAt;
    const second = await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}/disable`).expect(200);
    expect(second.body.updatedAt).toBe(timestamp);
    await request(app.getHttpServer()).patch('/api/businesses/invalido/resources/33333333-3333-4333-8333-333333333333/disable').expect(400);
    await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceB}/disable`).expect(404);
    businesses = [makeBusiness(businessA, BusinessStatus.ARCHIVED)];
    await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}/disable`).expect(409);
    businesses = [makeBusiness(businessA)]; resources = [makeResource(ResourceStatus.ARCHIVED)];
    await request(app.getHttpServer()).patch(`/api/businesses/${businessA}/resources/${resourceA}/disable`).expect(409);
  });
});
