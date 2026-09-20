import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { ACCESS_TOKEN_VERIFIER } from '../../src/modules/identity/domain/access-token-issuer';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { AuthorizationPolicy, Capability } from '../../src/shared/application/authorization-policy';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { RESOURCE_SEARCH_READER } from '../../src/modules/resource/resource.contract';
import { CONTACT_SEARCH_READER } from '../../src/modules/contact/contact.contract';
import { BOOKING_SEARCH_READER } from '../../src/modules/booking/booking.contract';
import type { SearchResponse } from '../../src/modules/search/application/search-business.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const bookingId = '33333333-3333-4333-8333-333333333333';
const resources = { read: jest.fn() }, contacts = { read: jest.fn() }, bookings = { read: jest.fn() };
const policy = new AuthorizationPolicy();
let role = MembershipRole.OWNER;
let revoked = false;
let business: { status: string } | null;
let app: INestApplication;
const endpoint = `/api/businesses/${businessId}/search`;
const get = (suffix = '?q=ab') => request(app.getHttpServer()).get(endpoint + suffix).set('Authorization', 'Bearer synthetic');

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ACCESS_TOKEN_VERIFIER).useValue({ verify: () => Promise.resolve({ sub: userId }) })
    .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: () => Promise.resolve({ id: userId, status: 'ACTIVE' }) })
    .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({ findByUserAndBusiness: (_user: string, id: string) => Promise.resolve(!revoked && id === businessId ? { role } : null) })
    .overrideProvider(BUSINESS_REPOSITORY).useValue({ findById: () => Promise.resolve(business) })
    .overrideProvider(RESOURCE_SEARCH_READER).useValue(resources)
    .overrideProvider(CONTACT_SEARCH_READER).useValue(contacts)
    .overrideProvider(BOOKING_SEARCH_READER).useValue(bookings)
    .overrideProvider(AuthorizationPolicy).useValue(policy)
    .compile();
  app = module.createNestApplication(); configureApplication(app); await app.init();
});
afterAll(async () => app.close());
beforeEach(() => {
  jest.restoreAllMocks(); resources.read.mockReset().mockResolvedValue([]); contacts.read.mockReset().mockResolvedValue([]); bookings.read.mockReset().mockResolvedValue([]);
  role = MembershipRole.OWNER; revoked = false; business = { status: 'ACTIVE' };
});

it.each(['', '?q=', '?q=%20%20', '?q=a', `?q=${'a'.repeat(121)}`, '?q=ab&q=cd', '?q[x]=ab'])('rechaza q inválido %s', async (suffix) => {
  await get(suffix).expect(400); expect(resources.read).not.toHaveBeenCalled();
});
it('valida UUID y Business activo', async () => {
  await request(app.getHttpServer()).get('/api/businesses/invalid/search?q=ab').set('Authorization', 'Bearer synthetic').expect(400);
  business = null; await get().expect(404);
  business = { status: 'ARCHIVED' }; await get().expect(409);
  business = { status: 'SUSPENDED' }; await get().expect(409);
  expect(resources.read).not.toHaveBeenCalled();
});
it.each(Object.values(MembershipRole))('permite %s por la policy real', async (value) => {
  role = value;
  const response = await get('?q=%20ab%20').expect(200).expect('Cache-Control', 'no-store');
  expect((response.body as SearchResponse).groups).toEqual(['resource', 'contact', 'booking'].map((type) => ({ type, items: [], hasMore: false })));
  expect(resources.read).toHaveBeenCalledWith(businessId, 'ab');
  expect(bookings.read).not.toHaveBeenCalled();
});
it('rechaza anónimo, otro tenant y membresía revocada sin ejecutar lectores', async () => {
  await request(app.getHttpServer()).get(endpoint + '?q=ab').expect(401);
  await request(app.getHttpServer()).get(`/api/businesses/${bookingId}/search?q=ab`).set('Authorization', 'Bearer synthetic').expect(403);
  revoked = true; await get().expect(403); expect(resources.read).not.toHaveBeenCalled();
});
it('omite el grupo denegado sin invocar su reader ni exponer señales', async () => {
  const original = policy.isAllowed.bind(policy);
  jest.spyOn(policy, 'isAllowed').mockImplementation((value, capability) => capability !== String(Capability.CONTACT_READ) && original(value, capability));
  const response = await get().expect(200);
  expect((response.body as SearchResponse).groups.map((group) => group.type)).toEqual(['resource', 'booking']);
  expect(contacts.read).not.toHaveBeenCalled();
});
it('search.read no puede eludirse', async () => {
  jest.spyOn(policy, 'isAllowed').mockReturnValue(false);
  await get().expect(403); expect(resources.read).not.toHaveBeenCalled();
});
it.each([0, 5, 6, 7])('limita y mapea exclusivamente el DTO con %s filas', async (count) => {
  const rows = Array.from({ length: count }, (_, index) => ({ id: `${index}`, title: 'Título', subtitle: null, status: 'ACTIVE', documentNumber: 'synthetic-private' }));
  resources.read.mockResolvedValue(rows); contacts.read.mockResolvedValue(rows);
  const response = await get().expect(200);
  const body = response.body as SearchResponse;
  for (const group of body.groups.slice(0, 2)) {
    expect(group.items).toHaveLength(Math.min(count, 5)); expect(group.hasMore).toBe(count > 5);
    for (const item of group.items) expect(Object.keys(item).sort()).toEqual(['id', 'status', 'subtitle', 'title', 'type']);
  }
  expect(JSON.stringify(body)).not.toContain('synthetic-private');
});
it('solo consulta Booking por UUID completo en el Business pedido', async () => {
  await get('?q=33333333').expect(200); expect(bookings.read).not.toHaveBeenCalled();
  bookings.read.mockResolvedValue([{ id: bookingId, title: `Reserva ${bookingId}`, subtitle: null, status: 'DRAFT' }]);
  const response = await get(`?q=${bookingId}`).expect(200);
  expect(bookings.read).toHaveBeenCalledWith(businessId, bookingId);
  expect((response.body as SearchResponse).groups[2]).toMatchObject({ hasMore: false, items: [{ id: bookingId }] });
});
it('falla el bloque entero ante fallo técnico', async () => {
  contacts.read.mockRejectedValue(new Error('synthetic-internal'));
  const response = await get().expect(500);
  expect(response.body).not.toHaveProperty('groups'); expect(JSON.stringify(response.body)).not.toContain('synthetic-internal');
});
it('inicia lectores concurrentemente', async () => {
  let release: (rows: never[]) => void = () => undefined;
  resources.read.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  contacts.read.mockImplementation(() => { release([]); return Promise.resolve([]); });
  await get().expect(200);
});
