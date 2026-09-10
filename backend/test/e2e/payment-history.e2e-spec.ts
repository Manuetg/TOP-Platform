import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { BOOKING_REPOSITORY } from '../../src/modules/booking/booking.contract';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import {
  PAYMENT_REPOSITORY,
  PaymentMethod,
  PaymentStatus,
  type Payment,
  type PaymentCursor,
  type PublicPayment,
} from '../../src/modules/payment/domain/payment';

const secret = 'payment-history-e2e-secret';
const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const bookingId = '33333333-3333-4333-8333-333333333333';
const otherBusinessId = '44444444-4444-4444-8444-444444444444';

const business = (status = BusinessStatus.ACTIVE) => Business.create({
  id: businessId,
  businessNumber: null,
  name: 'TOP History',
  legalName: null,
  taxId: null,
  timezone: 'America/Asuncion',
  currency: 'PYG',
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const booking = (owner = businessId, status = BookingStatus.CONFIRMED) => Booking.create({
  id: bookingId,
  businessId: owner,
  status,
  contactId: null,
  resourceIds: [],
  checkInDate: null,
  checkOutDate: null,
  adults: null,
  children: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const payment = (id: string, paidAt: string, createdAt: string): Payment => ({
  id,
  businessId,
  bookingId,
  amountMinor: 25,
  currency: 'PYG',
  method: PaymentMethod.BANK_TRANSFER,
  reference: 'TRX-123',
  note: null,
  paidAt: new Date(paidAt),
  createdAt: new Date(createdAt),
  recordedByUserId: userId,
  status: PaymentStatus.RECORDED,
  idempotencyKey: `key-${id}`,
  requestFingerprint: `fingerprint-${id}`,
});

describe('Payment History API', () => {
  let app: INestApplication;
  let currentBooking = booking();
  let currentBusiness = business();
  let membershipRole: MembershipRole | null = MembershipRole.VIEWER;
  let payments: Payment[] = [];
  const jwt = new JwtService();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue({ findById: (id: string) => Promise.resolve(id === businessId ? currentBusiness : null) })
      .overrideProvider(BOOKING_REPOSITORY)
      .useValue({
        findByIdAndBusinessId: (id: string, owner: string) => Promise.resolve(
          id === bookingId && currentBooking.businessId === owner ? currentBooking : null,
        ),
      })
      .overrideProvider(PAYMENT_REPOSITORY)
      .useValue({
        register: jest.fn(),
        listByBooking: ({ businessId: owner, bookingId: requestedBookingId, before, limit }: { businessId:string; bookingId:string; before:PaymentCursor|null; limit:number }): Promise<PublicPayment[]> => Promise.resolve(
          payments
            .filter((item) => item.businessId === owner && item.bookingId === requestedBookingId)
            .sort(comparePayments)
            .filter((item) => !before || isAfterCursor(item, before))
            .slice(0, limit)
            .map(toPublicPayment),
        ),
      })
      .overrideProvider(USER_BY_ID_LOOKUP)
      .useValue({
        findById: (id: string) => Promise.resolve(id === userId ? User.create({
          id: userId,
          email: 'viewer@example.com',
          status: UserStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) : null),
      })
      .overrideProvider(MEMBERSHIP_REPOSITORY)
      .useValue({
        findByUserAndBusiness: (requestedUserId: string, requestedBusinessId: string) => Promise.resolve(
          requestedUserId === userId && membershipRole
            ? UserBusinessMembership.create({
              id: '55555555-5555-4555-8555-555555555555',
              userId,
              businessId: requestedBusinessId,
              role: membershipRole,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            : null,
        ),
        findByUserId: () => Promise.resolve([]),
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    currentBooking = booking();
    currentBusiness = business();
    membershipRole = MembershipRole.VIEWER;
    payments = [];
  });

  const endpoint = (owner = businessId, id = bookingId) => `/api/businesses/${owner}/bookings/${id}/payments`;
  const bearer = () => jwt.sign({ sub: userId }, { secret, algorithm: 'HS256', expiresIn: 900 });
  const authorizedGet = (url = endpoint()) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${bearer()}`);

  it('returns the exact public response contract and deterministic next page', async () => {
    payments = [
      payment('60000000-0000-4000-8000-000000000001', '2026-09-08T10:00:00.000Z', '2026-09-09T10:00:00.000Z'),
      payment('60000000-0000-4000-8000-000000000002', '2026-09-09T10:00:00.000Z', '2026-09-09T10:00:00.000Z'),
      payment('60000000-0000-4000-8000-000000000003', '2026-09-09T10:00:00.000Z', '2026-09-09T11:00:00.000Z'),
    ];
    const first = await authorizedGet(`${endpoint()}?limit=2`).expect(200);
    expect(first.body.items.map((item: {id:string}) => item.id)).toEqual([
      '60000000-0000-4000-8000-000000000003',
      '60000000-0000-4000-8000-000000000002',
    ]);
    expect(first.body.pageInfo).toEqual({ hasNextPage: true, nextCursor: expect.any(String) });
    expect(first.body.items[0]).toEqual({
      id: '60000000-0000-4000-8000-000000000003',
      bookingId,
      amountMinor: 25,
      currency: 'PYG',
      method: 'BANK_TRANSFER',
      reference: 'TRX-123',
      note: null,
      paidAt: '2026-09-09T10:00:00.000Z',
      createdAt: '2026-09-09T11:00:00.000Z',
      recordedByUserId: userId,
      status: 'RECORDED',
    });
    expect(first.body.items[0]).not.toHaveProperty('businessId');
    expect(first.body.items[0]).not.toHaveProperty('idempotencyKey');
    expect(first.body.items[0]).not.toHaveProperty('requestFingerprint');
    expect(first.body.items[0]).not.toHaveProperty('applications');
    const second = await authorizedGet(`${endpoint()}?limit=2&cursor=${encodeURIComponent(first.body.pageInfo.nextCursor)}`).expect(200);
    expect(second.body).toEqual({
      items: [expect.objectContaining({ id: '60000000-0000-4000-8000-000000000001' })],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
  });

  it('returns an empty page without requiring PricingSnapshot or PaymentPlan', async () => {
    currentBooking = booking(businessId, BookingStatus.DRAFT);
    await authorizedGet().expect(200).expect({ items: [], pageInfo: { nextCursor: null, hasNextPage: false } });
  });

  it.each([
    MembershipRole.OWNER,
    MembershipRole.ADMIN,
    MembershipRole.RECEPTIONIST,
    MembershipRole.VIEWER,
  ])('allows payment.read to %s', async (role) => {
    membershipRole = role;
    await authorizedGet().expect(200);
  });

  it.each([BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])('allows historical reads for %s', async (status) => {
    currentBooking = booking(businessId, status);
    payments = [payment('60000000-0000-4000-8000-000000000001', '2020-01-01T10:00:00.000Z', '2026-09-09T10:00:00.000Z')];
    await authorizedGet().expect(200).expect(({ body }) => expect(body.items).toHaveLength(1));
  });

  it('allows the historical GET when the Business is archived by not applying a write-state restriction', async () => {
    currentBusiness = business(BusinessStatus.ARCHIVED);
    payments = [payment('60000000-0000-4000-8000-000000000001', '2020-01-01T10:00:00.000Z', '2026-09-09T10:00:00.000Z')];
    await authorizedGet().expect(200);
  });

  it.each(['0', '51', '1.5', 'text'])('returns 400 for invalid limit %s', async (limit) => {
    await authorizedGet(`${endpoint()}?limit=${limit}`).expect(400);
  });

  it.each(['invalid', Buffer.from('{invalid').toString('base64url')])('returns 400 for invalid cursor %s', async (cursor) => {
    await authorizedGet(`${endpoint()}?cursor=${encodeURIComponent(cursor)}`).expect(400);
  });

  it('distinguishes authentication, Membership and tenant-scoped Booking failures', async () => {
    await request(app.getHttpServer()).get(endpoint()).expect(401);
    membershipRole = null;
    await authorizedGet().expect(403);
    membershipRole = MembershipRole.VIEWER;
    await authorizedGet(endpoint(businessId, '77777777-7777-4777-8777-777777777777')).expect(404);
    currentBooking = booking(otherBusinessId);
    await authorizedGet().expect(404);
  });
});

function comparePayments(left: Payment, right: Payment): number {
  return right.paidAt.getTime() - left.paidAt.getTime()
    || right.createdAt.getTime() - left.createdAt.getTime()
    || right.id.localeCompare(left.id);
}

function isAfterCursor(payment: Payment, cursor: PaymentCursor): boolean {
  return payment.paidAt < cursor.paidAt
    || (payment.paidAt.getTime() === cursor.paidAt.getTime() && payment.createdAt < cursor.createdAt)
    || (payment.paidAt.getTime() === cursor.paidAt.getTime()
      && payment.createdAt.getTime() === cursor.createdAt.getTime()
      && payment.id < cursor.id);
}

function toPublicPayment(payment: Payment): PublicPayment {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    note: payment.note,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    recordedByUserId: payment.recordedByUserId,
    status: payment.status,
  };
}
