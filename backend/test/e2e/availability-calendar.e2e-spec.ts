import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
} from '../../src/modules/business/business.contract';
import {
  BLOCK_AVAILABILITY_LOOKUP,
  type BlockingBlock,
} from '../../src/modules/block/block.contract';
import {
  BOOKING_AVAILABILITY_LOOKUP,
  type BlockingBooking,
} from '../../src/modules/booking/booking.contract';
import { Resource } from '../../src/modules/resource/domain/resource.entity';
import {
  RESOURCE_REPOSITORY,
  ResourceStatus,
} from '../../src/modules/resource/resource.contract';

const businessId = '11111111-1111-4111-8111-111111111111';
const otherBusinessId = '22222222-2222-4222-8222-222222222222';
const resourceAId = '33333333-3333-4333-8333-333333333333';
const resourceBId = '44444444-4444-4444-8444-444444444444';

const resource = (
  id: string,
  status: ResourceStatus,
  business = businessId,
): Resource =>
  Resource.create({
    id,
    businessId: business,
    name: id === resourceAId ? 'Cabaña A' : 'Cabaña B',
    internalCode: id,
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 2,
    capacityMaximumChildren: 0,
    status,
    sortOrder: id === resourceAId ? 1 : 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('Availability calendar endpoint', () => {
  let app: INestApplication;
  let resources: Resource[];
  let bookingConflicts: BlockingBooking[];
  let blockConflicts: BlockingBlock[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue({
        findById: (id: string) =>
          Promise.resolve(
            id === businessId ? { status: BusinessStatus.ACTIVE } : null,
          ),
        create: jest.fn(),
        list: jest.fn(),
        update: jest.fn(),
      })
      .overrideProvider(RESOURCE_REPOSITORY)
      .useValue({
        findByIdAndBusinessId: (id: string, owner: string) =>
          Promise.resolve(
            resources.find(
              (candidate) =>
                candidate.id === id && candidate.businessId === owner,
            ) ?? null,
          ),
        findByBusinessAndCode: jest.fn(),
        listByBusinessId: (owner: string) =>
          Promise.resolve(resources.filter((candidate) => candidate.businessId === owner)),
        create: jest.fn(),
        update: jest.fn(),
      })
      .overrideProvider(BOOKING_AVAILABILITY_LOOKUP)
      .useValue({
        hasBlockingBooking: jest.fn(),
        listBlockingBookings: () => Promise.resolve(bookingConflicts),
      })
      .overrideProvider(BLOCK_AVAILABILITY_LOOKUP)
      .useValue({
        hasBlockingBlock: jest.fn(),
        listBlockingBlocks: () => Promise.resolve(blockConflicts),
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    resources = [
      resource(resourceAId, ResourceStatus.ACTIVE),
      resource(resourceBId, ResourceStatus.ACTIVE),
    ];
    bookingConflicts = [];
    blockConflicts = [];
  });

  const get = (suffix = '') =>
    request(app.getHttpServer()).get(
      `/api/businesses/${businessId}/availability/calendar?from=2026-04-01&to=2026-04-04${suffix}`,
    );

  it('returns an ordered matrix and joins booking and block reasons per day', async () => {
    bookingConflicts = [
      {
        resourceId: resourceAId,
        checkInDate: new Date('2026-04-02'),
        checkOutDate: new Date('2026-04-04'),
      },
    ];
    blockConflicts = [
      {
        resourceId: resourceAId,
        startsAt: new Date('2026-04-03'),
        endsAt: new Date('2026-04-04'),
      },
    ];

    const response = await get().expect(200);
    expect(response.body.resources).toEqual([
      expect.objectContaining({
        resourceId: resourceAId,
        days: [
          { date: '2026-04-01', status: 'AVAILABLE', reasons: [] },
          {
            date: '2026-04-02',
            status: 'UNAVAILABLE',
            reasons: ['BOOKING_CONFLICT'],
          },
          {
            date: '2026-04-03',
            status: 'UNAVAILABLE',
            reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'],
          },
        ],
      }),
      expect.objectContaining({ resourceId: resourceBId }),
    ]);
  });

  it('includes non-active resources as unavailable and supports resourceId scope', async () => {
    resources = [
      resource(resourceAId, ResourceStatus.OUT_OF_SERVICE),
      resource(resourceBId, ResourceStatus.ARCHIVED),
    ];

    expect((await get().expect(200)).body.resources).toEqual([
      expect.objectContaining({
        resourceId: resourceAId,
        days: [
          expect.objectContaining({
            reasons: ['RESOURCE_OUT_OF_SERVICE'],
          }),
        ],
      }),
      expect.objectContaining({
        resourceId: resourceBId,
        days: [
          expect.objectContaining({
            reasons: ['RESOURCE_ARCHIVED'],
          }),
        ],
      }),
    ]);

    await get(`&resourceId=${resourceAId}`)
      .expect(200)
      .expect(expect.objectContaining({ resources: [expect.objectContaining({ resourceId: resourceAId })] }));
  });

  it('validates calendar range and hides a resource outside the tenant', async () => {
    await request(app.getHttpServer())
      .get(
        `/api/businesses/${businessId}/availability/calendar?from=2026-04-01&to=2026-05-03`,
      )
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/businesses/${businessId}/availability/calendar?from=2026-04-02&to=2026-04-01`,
      )
      .expect(400);
    resources.push(resource('55555555-5555-4555-8555-555555555555', ResourceStatus.ACTIVE, otherBusinessId));
    await get('&resourceId=55555555-5555-4555-8555-555555555555').expect(404);
  });
});
