import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { BOOKING_REPOSITORY } from '../../src/modules/booking/booking.contract';
import { Booking } from '../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import {
  OUTSTANDING_BALANCE_REPOSITORY,
  type OutstandingBalanceProjection,
} from '../../src/modules/payment/domain/outstanding-balance';
import { PRICING_SNAPSHOT_REPOSITORY } from '../../src/modules/pricing/pricing.contract';

const secret = 'outstanding-balance-e2e-secret';
const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const otherBusinessId = '33333333-3333-4333-8333-333333333333';
const bookingId = '44444444-4444-4444-8444-444444444444';

const business = (id: string, status = BusinessStatus.ACTIVE) =>
  Business.create({
    id,
    businessNumber: null,
    name: 'TOP',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const booking = (status = BookingStatus.CONFIRMED) =>
  Booking.create({
    id: bookingId,
    businessId,
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

describe('Outstanding Balance API', () => {
  let app: INestApplication;
  let currentBooking = booking();
  let currentBusiness = business(businessId);
  let hasSnapshot = true;
  let membershipRole: MembershipRole | null = MembershipRole.VIEWER;
  let projection: OutstandingBalanceProjection = noPlanProjection();
  const jwt = new JwtService();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue({
        findById: (id: string) =>
          Promise.resolve(
            id === businessId
              ? currentBusiness
              : id === otherBusinessId
                ? business(otherBusinessId)
                : null,
          ),
      })
      .overrideProvider(BOOKING_REPOSITORY)
      .useValue({
        findByIdAndBusinessId: (id: string, owner: string) =>
          Promise.resolve(
            id === bookingId && owner === businessId ? currentBooking : null,
          ),
      })
      .overrideProvider(PRICING_SNAPSHOT_REPOSITORY)
      .useValue({
        findByBookingId: (id: string) =>
          Promise.resolve(
            hasSnapshot && id === bookingId
              ? {
                  id: 'snapshot',
                  businessId,
                  bookingId,
                  currency: 'PYG',
                  totalAmountMinor: 100,
                  items: [],
                  createdAt: new Date(),
                }
              : null,
          ),
      })
      .overrideProvider(OUTSTANDING_BALANCE_REPOSITORY)
      .useValue({ calculate: () => Promise.resolve(projection) })
      .overrideProvider(USER_BY_ID_LOOKUP)
      .useValue({
        findById: (id: string) =>
          Promise.resolve(
            id === userId
              ? User.create({
                  id: userId,
                  email: 'viewer@example.com',
                  status: UserStatus.ACTIVE,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
              : null,
          ),
      })
      .overrideProvider(MEMBERSHIP_REPOSITORY)
      .useValue({
        findByUserAndBusiness: (
          requestedUserId: string,
          requestedBusinessId: string,
        ) =>
          Promise.resolve(
            requestedUserId === userId && membershipRole
              ? UserBusinessMembership.create({
                  id: crypto.randomUUID(),
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
    currentBusiness = business(businessId);
    hasSnapshot = true;
    membershipRole = MembershipRole.VIEWER;
    projection = noPlanProjection();
  });

  const endpoint = (owner = businessId, id = bookingId) =>
    `/api/businesses/${owner}/bookings/${id}/outstanding-balance`;
  const bearer = () =>
    jwt.sign({ sub: userId }, { secret, algorithm: 'HS256', expiresIn: 900 });
  const authorizedGet = (owner = businessId, id = bookingId) =>
    request(app.getHttpServer())
      .get(endpoint(owner, id))
      .set('Authorization', `Bearer ${bearer()}`);

  it('returns the exact response contract without a PaymentPlan', async () => {
    projection = noPlanProjection(40);
    const response = await authorizedGet().expect(200);
    expect(response.body).toEqual({
      bookingId,
      currency: 'PYG',
      totalAmountMinor: 100,
      paidAmountMinor: 40,
      outstandingAmountMinor: 60,
      overdueAmountMinor: 0,
      financialStatus: 'PARTIALLY_PAID',
      nextDueDate: null,
      nextDueAmountMinor: null,
    });
  });

  it('returns derived overdue and next due values with a plan', async () => {
    projection = {
      paymentPlanId: 'plan',
      paidAmountMinor: 40,
      planTotalAmountMinor: 100,
      installmentTotalAmountMinor: 100,
      appliedAmountMinor: 40,
      overdueAmountMinor: 20,
      nextDueDate: new Date('2026-09-01'),
      nextDueAmountMinor: 20,
    };
    await authorizedGet()
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          financialStatus: 'OVERDUE',
          overdueAmountMinor: 20,
          nextDueDate: '2026-09-01',
          nextDueAmountMinor: 20,
        }),
      );
  });

  it('allows VIEWER and archived Business historical reads', async () => {
    currentBusiness = business(businessId, BusinessStatus.ARCHIVED);
    await authorizedGet().expect(200);
  });

  it.each([
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('allows historical read for %s', async (status) => {
    currentBooking = booking(status);
    await authorizedGet().expect(200);
  });

  it('returns 401 without authentication and 403 without Membership', async () => {
    await request(app.getHttpServer()).get(endpoint()).expect(401);
    membershipRole = null;
    await authorizedGet().expect(403);
  });

  it('returns 404 for missing and cross-tenant Booking without leakage', async () => {
    await authorizedGet(businessId, crypto.randomUUID()).expect(404);
    await authorizedGet(otherBusinessId).expect(404);
  });

  it('returns 409 when the Booking has no PricingSnapshot', async () => {
    hasSnapshot = false;
    await authorizedGet().expect(409);
  });
});

function noPlanProjection(paidAmountMinor = 0) {
  return {
    paymentPlanId: null,
    paidAmountMinor,
    planTotalAmountMinor: null,
    installmentTotalAmountMinor: 0,
    appliedAmountMinor: 0,
    overdueAmountMinor: 0,
    nextDueDate: null,
    nextDueAmountMinor: null,
  };
}
