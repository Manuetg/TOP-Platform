import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/domain/business.repository';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { RESOURCE_REPOSITORY } from '../../src/modules/resource/domain/resource.repository';
import { Resource } from '../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../src/modules/resource/domain/resource-status.enum';
import { CONTACT_LOOKUP } from '../../src/modules/contact/contact.contract';
import { BOOKING_REPOSITORY, type BookingListFilters } from '../../src/modules/booking/domain/booking.repository';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { BOOKING_TIMELINE_REPOSITORY } from '../../src/modules/booking/booking.contract';
import { BookingTimelineEventType, type BookingTimelineEvent } from '../../src/modules/booking/domain/booking-timeline-event';

const businessId = '11111111-1111-4111-8111-111111111111'; const otherBusinessId = '22222222-2222-4222-8222-222222222222'; const resourceId = '33333333-3333-4333-8333-333333333333';
const business = (id: string) => Business.create({ id, businessNumber: null, name: id, legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
const resource = (id: string, owner: string, status = ResourceStatus.ACTIVE) => Resource.create({ id, businessId: owner, name: 'Cabaña', internalCode: id, description: null, capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
const listedBooking = (id: string, overrides: Partial<Parameters<typeof Booking.create>[0]> = {}) => Booking.create({
  id, businessId, status: BookingStatus.DRAFT, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null,
  adults: null, children: null, notes: null, createdAt: new Date('2026-08-29T12:00:00.000Z'), updatedAt: new Date('2026-08-29T12:00:00.000Z'), ...overrides,
});
describe('Booking endpoint', () => { let app: INestApplication; let bookings: Booking[]; let resources: Resource[]; let timelineEvents:BookingTimelineEvent[];
  const listByBusinessId = jest.fn((owner: string, filters: BookingListFilters) => Promise.resolve(bookings.filter((item) => item.businessId === owner
    && (filters.status === null || item.status === filters.status)
    && (filters.contactId === null || item.contactId === filters.contactId)
    && (filters.resourceId === null || item.resourceIds.includes(filters.resourceId)))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || left.id.localeCompare(right.id))));
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: (id: string) => Promise.resolve([business(businessId), business(otherBusinessId)].find((item) => item.id === id) ?? null), create: jest.fn(), list: jest.fn(), update: jest.fn() }).overrideProvider(RESOURCE_REPOSITORY).useValue({ findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(resources.find((item) => item.id === id && item.businessId === owner) ?? null), findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() }).overrideProvider(CONTACT_LOOKUP).useValue({ findByIdAndBusinessId: () => Promise.resolve(null) }).overrideProvider(BOOKING_REPOSITORY).useValue({ create: (data: { businessId: string; contactId: string | null; resourceIds: string[]; checkInDate: Date | null; checkOutDate: Date | null; adults: number | null; children: number | null; notes: string | null }) => { const created = Booking.create({ id: `44444444-4444-4444-8444-${String(bookings.length + 1).padStart(12, '0')}`, ...data, status: BookingStatus.DRAFT, createdAt: new Date(), updatedAt: new Date() }); bookings.push(created); timelineEvents.push({id:crypto.randomUUID(),businessId:data.businessId,bookingId:created.id,type:BookingTimelineEventType.BOOKING_CREATED,occurredAt:new Date(),actorUserId:null,details:{}}); return Promise.resolve(created); }, findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(bookings.find((item) => item.id === id && item.businessId === owner) ?? null), listByBusinessId, update: (changed: Booking) => { bookings = bookings.map((item) => item.id === changed.id ? changed : item); return Promise.resolve(changed); },markPending:jest.fn(),markCancelled:jest.fn(),appendTimelineEvent:jest.fn(),hasBlockingBooking:jest.fn(),listBlockingBookings:jest.fn() }).overrideProvider(BOOKING_TIMELINE_REPOSITORY).useValue({list:({businessId:owner,bookingId:id,limit}:{businessId:string;bookingId:string;limit:number})=>Promise.resolve(timelineEvents.filter((event)=>event.businessId===owner&&event.bookingId===id).slice(0,limit))}).compile(); app = module.createNestApplication(); configureApplication(app, { security: false }); await app.init(); }); afterAll(async () => app.close()); beforeEach(() => { listByBusinessId.mockClear(); bookings = []; timelineEvents=[]; resources = [resource(resourceId, businessId), resource('55555555-5555-4555-8555-555555555555', otherBusinessId)]; });
  it('creates an empty Draft, gets it, lists it and updates draft fields publicly', async () => { const response = await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ notes: ' Nota ' }).expect(201); expect(response.body).toMatchObject({ status: 'DRAFT', notes: 'Nota', resourceIds: [] }); const id = response.body.id as string; await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings/${id}`).expect(200); await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings?status=DRAFT`).expect(200); await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/bookings/${id}`).send({ resourceIds: [] }).expect(200); });
  it.each(Object.values(BookingStatus))('preserves the HTTP status filter %s before listing within its Business', async (status) => {
    const local = Object.values(BookingStatus).map((value, index) => listedBooking(`80000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, { status: value }));
    bookings = [...local, listedBooking('90000000-0000-4000-8000-000000000001', { businessId: otherBusinessId, status })];
    const response = await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings`).query({ status, ignored: 'not-a-filter' }).expect(200);
    expect(response.body).toEqual([expect.objectContaining({ id: local.find((item) => item.status === status)!.id, status })]);
    expect(listByBusinessId).toHaveBeenCalledTimes(1);
    expect(listByBusinessId).toHaveBeenCalledWith(businessId, { status, contactId: null, resourceId: null });
  });
  it.each(['contactId', 'resourceId', 'combined'] as const)('preserves the HTTP %s filters and their intersection', async (filter) => {
    const contactId = '60000000-0000-4000-8000-000000000001';
    const otherContactId = '60000000-0000-4000-8000-000000000002';
    const otherResourceId = '70000000-0000-4000-8000-000000000002';
    const matching = { status: BookingStatus.CONFIRMED, contactId, resourceIds: [resourceId] };
    const ids = [1, 2, 3, 4, 5].map((index) => `80000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    bookings = [listedBooking(ids[0], matching), listedBooking(ids[1], { ...matching, status: BookingStatus.DRAFT }),
      listedBooking(ids[2], { ...matching, contactId: otherContactId }), listedBooking(ids[3], { ...matching, resourceIds: [otherResourceId] }),
      listedBooking(ids[4], { ...matching, businessId: otherBusinessId })];
    const query = filter === 'combined' ? { status: BookingStatus.CONFIRMED, contactId, resourceId } : { [filter]: filter === 'contactId' ? contactId : resourceId };
    const response = await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings`).query(query).expect(200);
    const expectedIds = filter === 'combined' ? [ids[0]] : filter === 'contactId' ? [ids[0], ids[1], ids[3]] : [ids[0], ids[1], ids[2]];
    expect((response.body as Array<{ id: string }>).map((item) => item.id)).toEqual(expectedIds);
    expect(listByBusinessId).toHaveBeenCalledWith(businessId, {
      status: filter === 'combined' ? BookingStatus.CONFIRMED : null,
      contactId: filter === 'resourceId' ? null : contactId,
      resourceId: filter === 'contactId' ? null : resourceId,
    });
  });
  it('returns an empty filtered list for foreign Contact and Resource IDs without leaking another Business', async () => {
    const foreignContactId = '60000000-0000-4000-8000-000000000002';
    const foreignResourceId = '70000000-0000-4000-8000-000000000002';
    bookings = [listedBooking('80000000-0000-4000-8000-000000000001'),
      listedBooking('80000000-0000-4000-8000-000000000002', { businessId: otherBusinessId, contactId: foreignContactId, resourceIds: [foreignResourceId] })];
    await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings`).query({ contactId: foreignContactId }).expect(200).expect([]);
    await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings`).query({ resourceId: foreignResourceId }).expect(200).expect([]);
    expect(listByBusinessId).toHaveBeenNthCalledWith(1, businessId, { status: null, contactId: foreignContactId, resourceId: null });
    expect(listByBusinessId).toHaveBeenNthCalledWith(2, businessId, { status: null, contactId: null, resourceId: foreignResourceId });
  });
  it.each(['status=OTHER', 'status=', 'status=DRAFT&status=CONFIRMED', 'contactId=invalid', 'contactId=',
    'contactId=60000000-0000-4000-8000-000000000001&contactId=60000000-0000-4000-8000-000000000002',
    'resourceId=invalid', 'resourceId=', 'resourceId=70000000-0000-4000-8000-000000000001&resourceId=70000000-0000-4000-8000-000000000002'])
  ('rejects invalid HTTP filters %s before querying the repository', async (query) => {
    await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings?${query}`).expect(400);
    expect(listByBusinessId).not.toHaveBeenCalled();
  });
  it('lists only its Business with omitted filters and preserves the public ordering', async () => {
    const newest = new Date('2026-08-30T12:00:00.000Z');
    const ids = [1, 2, 3, 4].map((index) => `80000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    bookings = [listedBooking(ids[2]), listedBooking(ids[1], { createdAt: newest }), listedBooking(ids[0], { createdAt: newest }),
      listedBooking(ids[3], { businessId: otherBusinessId, createdAt: new Date('2026-08-31T12:00:00.000Z') })];
    const response = await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings`).expect(200);
    expect((response.body as Array<{ id: string }>).map((item) => item.id)).toEqual([ids[0], ids[1], ids[2]]);
    expect(listByBusinessId).toHaveBeenCalledWith(businessId, { status: null, contactId: null, resourceId: null });
  });
  it('returns contract errors for invalid dates, duplicate resources, foreign bookings and non drafts', async () => { await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ checkInDate: '2026-04-02', checkOutDate: '2026-04-02' }).expect(400); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ resourceIds: [resourceId, resourceId] }).expect(400); const foreign = Booking.create({ id: '66666666-6666-4666-8666-666666666666', businessId: otherBusinessId, status: BookingStatus.DRAFT, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() }); const confirmed = Booking.create({ id: '77777777-7777-4777-8777-777777777777', businessId, status: BookingStatus.CONFIRMED, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() }); bookings = [foreign, confirmed]; await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings/${foreign.id}`).expect(404); await request(app.getHttpServer()).patch(`/api/businesses/${businessId}/bookings/${confirmed.id}`).send({ notes: 'x' }).expect(409); });
  it('accepts capacity boundaries, but rejects multiple Resources, children overflow and total overflow in a Draft', async () => { await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ resourceIds: [resourceId], adults: 2, children: 2 }).expect(201); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ resourceIds: [resourceId], adults: 4, children: 0 }).expect(201); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ resourceIds: [resourceId, '66666666-6666-4666-8666-666666666666'] }).expect(400); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ resourceIds: [resourceId], adults: 1, children: 3 }).expect(400); await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({ resourceIds: [resourceId], adults: 3, children: 2 }).expect(400); });
  it('returns the tenant-scoped timeline contract and validates pagination',async()=>{const created=await request(app.getHttpServer()).post(`/api/businesses/${businessId}/bookings`).send({}).expect(201);await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings/${created.body.id}/timeline?limit=1`).expect(200).expect(({body})=>expect(body).toMatchObject({items:[{type:'BOOKING_CREATED',actor:null,details:{}}],pageInfo:{hasNextPage:false,nextCursor:null}}));await request(app.getHttpServer()).get(`/api/businesses/${businessId}/bookings/${created.body.id}/timeline?cursor=invalid`).expect(400);await request(app.getHttpServer()).get(`/api/businesses/${otherBusinessId}/bookings/${created.body.id}/timeline`).expect(404);});
});
