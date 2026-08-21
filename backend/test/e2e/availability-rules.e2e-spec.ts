import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BUSINESS_REPOSITORY, BusinessStatus } from '../../src/modules/business/business.contract';
import { AVAILABILITY_RULES_REPOSITORY } from '../../src/modules/availability/domain/availability-rules.repository';

const businessId = '11111111-1111-4111-8111-111111111111';
describe('Availability rules endpoint', () => {
  let app: INestApplication; const rules = new Map<string, { businessId: string; pendingBlocksAvailability: boolean; bufferBeforeDays: number; bufferAfterDays: number }>();
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: (id: string) => Promise.resolve(id === businessId ? { status: BusinessStatus.ACTIVE } : null), create: jest.fn(), list: jest.fn(), update: jest.fn() }).overrideProvider(AVAILABILITY_RULES_REPOSITORY).useValue({ findByBusinessId: (id: string) => Promise.resolve(rules.get(id) ?? null), save: (value: { businessId: string; pendingBlocksAvailability: boolean; bufferBeforeDays: number; bufferAfterDays: number }) => { rules.set(value.businessId, value); return Promise.resolve(value); } }).compile(); app = module.createNestApplication(); configureApplication(app); await app.init(); });
  afterAll(async () => app.close()); beforeEach(() => rules.clear());
  it('returns defaults and updates the single business-scoped rule', async () => { await request(app.getHttpServer()).get(`/api/businesses/${businessId}/availability-rules`).expect(200).expect({ businessId, pendingBlocksAvailability: true, bufferBeforeDays: 0, bufferAfterDays: 0 }); await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/availability-rules`).send({ pendingBlocksAvailability: false, bufferBeforeDays: 1 }).expect(200).expect({ businessId, pendingBlocksAvailability: false, bufferBeforeDays: 1, bufferAfterDays: 0 }); });
  it('validates input and hides an unknown business', async () => { await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/availability-rules`).send({ bufferAfterDays: -1 }).expect(400); await request(app.getHttpServer()).get('/api/businesses/22222222-2222-4222-8222-222222222222/availability-rules').expect(404); });
});
