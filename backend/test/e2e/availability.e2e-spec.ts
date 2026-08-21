import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BUSINESS_REPOSITORY, BusinessStatus } from '../../src/modules/business/business.contract';
import { RESOURCE_REPOSITORY, ResourceStatus } from '../../src/modules/resource/resource.contract';
import { BOOKING_AVAILABILITY_LOOKUP } from '../../src/modules/booking/booking.contract';
import { BLOCK_AVAILABILITY_LOOKUP } from '../../src/modules/block/block.contract';

const businessId = '11111111-1111-4111-8111-111111111111'; const otherBusinessId = '22222222-2222-4222-8222-222222222222'; const resourceId = '33333333-3333-4333-8333-333333333333';

describe('Availability endpoint', () => {
  let app: INestApplication; let businessStatus = BusinessStatus.ACTIVE; let resourceStatus = ResourceStatus.ACTIVE; let bookingConflict = false; let blockConflict = false;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: (id: string) => Promise.resolve(id === businessId ? { status: businessStatus } : null), create: jest.fn(), list: jest.fn(), update: jest.fn() })
      .overrideProvider(RESOURCE_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(id === resourceId && owner === businessId ? { status: resourceStatus } : null), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() })
      .overrideProvider(BOOKING_AVAILABILITY_LOOKUP).useValue({ hasBlockingBooking: () => Promise.resolve(bookingConflict), listBlockingBookings: () => Promise.resolve([]) })
      .overrideProvider(BLOCK_AVAILABILITY_LOOKUP).useValue({ hasBlockingBlock: () => Promise.resolve(blockConflict), listBlockingBlocks: () => Promise.resolve([]) }).compile();
    app = module.createNestApplication(); configureApplication(app); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { businessStatus = BusinessStatus.ACTIVE; resourceStatus = ResourceStatus.ACTIVE; bookingConflict = false; blockConflict = false; });
  const get = (id = resourceId) => request(app.getHttpServer()).get(`/api/businesses/${businessId}/availability?resourceId=${id}&from=2026-04-01&to=2026-04-03`);
  it('returns available for an active resource without conflicts', async () => { await get().expect(200).expect({ resourceId, from: '2026-04-01', to: '2026-04-03', status: 'AVAILABLE', reasons: [] }); });
  it('reports Booking, Block and simultaneous conflicts', async () => { bookingConflict = true; expect((await get().expect(200)).body).toMatchObject({ status: 'UNAVAILABLE', reasons: ['BOOKING_CONFLICT'] }); bookingConflict = false; blockConflict = true; expect((await get().expect(200)).body).toMatchObject({ reasons: ['BLOCK_CONFLICT'] }); bookingConflict = true; expect((await get().expect(200)).body).toMatchObject({ reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'] }); });
  it.each([[ResourceStatus.OUT_OF_SERVICE, 'RESOURCE_OUT_OF_SERVICE'], [ResourceStatus.ARCHIVED, 'RESOURCE_ARCHIVED']] as const)('reports %s resources as unavailable', async (status, reason) => { resourceStatus = status; expect((await get().expect(200)).body).toMatchObject({ status: 'UNAVAILABLE', reasons: [reason] }); });
  it('returns 400 for invalid identifiers and ranges', async () => { await request(app.getHttpServer()).get(`/api/businesses/bad/availability?resourceId=${resourceId}&from=2026-04-01&to=2026-04-03`).expect(400); await request(app.getHttpServer()).get(`/api/businesses/${businessId}/availability?resourceId=bad&from=2026-04-01&to=2026-04-03`).expect(400); await request(app.getHttpServer()).get(`/api/businesses/${businessId}/availability?resourceId=${resourceId}&from=2026-04-03&to=2026-04-03`).expect(400); });
  it('hides nonexistent and cross-tenant resources', async () => { await get('44444444-4444-4444-8444-444444444444').expect(404); await request(app.getHttpServer()).get(`/api/businesses/${otherBusinessId}/availability?resourceId=${resourceId}&from=2026-04-01&to=2026-04-03`).expect(404); });
  it('maps unavailable businesses to conflict', async () => { businessStatus = BusinessStatus.ARCHIVED; await get().expect(409); });
});
