import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/config/configure-application';
import { OCCUPANCY_PROJECTION_READER } from '../../src/modules/availability/availability.contract';
import { RESERVATIONS_PROJECTION_READER } from '../../src/modules/booking/booking.contract';
import { BUSINESS_REPOSITORY } from '../../src/modules/business/business.contract';
import { Business } from '../../src/modules/business/domain/business.entity';
import { BusinessStatus } from '../../src/modules/business/domain/business-status.enum';
import { MEMBERSHIP_REPOSITORY } from '../../src/modules/identity/domain/membership.repository';
import { MembershipRole } from '../../src/modules/identity/domain/membership-role.enum';
import { UserBusinessMembership } from '../../src/modules/identity/domain/user-business-membership.entity';
import { USER_BY_ID_LOOKUP } from '../../src/modules/identity/domain/user-by-id.lookup';
import { UserStatus } from '../../src/modules/identity/domain/user-status.enum';
import { User } from '../../src/modules/identity/domain/user.entity';
import { REVENUE_PROJECTION_READER } from '../../src/modules/payment/payment.contract';

const secret = 'dashboard-e2e-secret';
const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const otherBusinessId = '33333333-3333-4333-8333-333333333333';
const missingBusinessId = '44444444-4444-4444-8444-444444444444';

function business(status = BusinessStatus.ACTIVE): Business {
  return Business.create({
    id: businessId,
    businessNumber: null,
    name: 'Dashboard Business',
    legalName: null,
    taxId: null,
    timezone: 'America/Asuncion',
    currency: 'PYG',
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('Business Dashboard API', () => {
  let app: INestApplication;
  let currentBusiness = business();
  let membershipRole: MembershipRole | null = MembershipRole.VIEWER;
  let membershipBusinessId = businessId;
  let occupancy = { occupiedResourceNights: 18, sellableResourceNights: 25 };
  let revenue = { amounts: [{ currency: 'PYG', amountMinor: 12_500_000 }] };
  let reservations = [{ status: 'CONFIRMED', count: 2 }];
  const jwt = new JwtService();

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BUSINESS_REPOSITORY)
      .useValue({
        findById: (id: string) => Promise.resolve(
          id === businessId ? currentBusiness : null,
        ),
      })
      .overrideProvider(OCCUPANCY_PROJECTION_READER)
      .useValue({ read: () => Promise.resolve(occupancy) })
      .overrideProvider(REVENUE_PROJECTION_READER)
      .useValue({ read: () => Promise.resolve(revenue) })
      .overrideProvider(RESERVATIONS_PROJECTION_READER)
      .useValue({ read: () => Promise.resolve(reservations) })
      .overrideProvider(USER_BY_ID_LOOKUP)
      .useValue({
        findById: (id: string) => Promise.resolve(
          id === userId
            ? User.create({
                id: userId,
                email: 'dashboard@example.com',
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
        ) => Promise.resolve(
          requestedUserId === userId &&
          requestedBusinessId === membershipBusinessId &&
          membershipRole
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
    currentBusiness = business();
    membershipRole = MembershipRole.VIEWER;
    membershipBusinessId = businessId;
    occupancy = { occupiedResourceNights: 18, sellableResourceNights: 25 };
    revenue = { amounts: [{ currency: 'PYG', amountMinor: 12_500_000 }] };
    reservations = [{ status: 'CONFIRMED', count: 2 }];
  });

  const endpoint = (owner = businessId, query = 'from=2026-09-01&to=2026-09-30') =>
    `/api/businesses/${owner}/dashboard?${query}`;
  const bearer = () => jwt.sign(
    { sub: userId },
    { secret, algorithm: 'HS256', expiresIn: 900 },
  );
  const authorizedGet = (owner = businessId, query?: string) => request(app.getHttpServer())
    .get(endpoint(owner, query))
    .set('Authorization', `Bearer ${bearer()}`);

  it('returns the exact public composition contract', async () => {
    await authorizedGet().expect(200).expect(({ body }) => expect(body).toEqual({
      occupancy: {
        occupiedResourceNights: 18,
        sellableResourceNights: 25,
        occupancyRateBasisPoints: 7200,
      },
      revenue: { currency: 'PYG', amountMinor: 12_500_000 },
      reservations: {
        total: 2,
        byStatus: {
          DRAFT: 0,
          PENDING: 0,
          CONFIRMED: 2,
          IN_PROGRESS: 0,
          COMPLETED: 0,
          CANCELLED: 0,
          NO_SHOW: 0,
        },
      },
    }));
  });

  it('returns complete empty metrics, including a null occupancy rate', async () => {
    occupancy = { occupiedResourceNights: 0, sellableResourceNights: 0 };
    revenue = { amounts: [] };
    reservations = [];
    await authorizedGet().expect(200).expect(({ body }) => {
      expect(body.occupancy.occupancyRateBasisPoints).toBeNull();
      expect(body.revenue).toEqual({ currency: 'PYG', amountMinor: 0 });
      expect(body.reservations).toEqual({
        total: 0,
        byStatus: {
          DRAFT: 0,
          PENDING: 0,
          CONFIRMED: 0,
          IN_PROGRESS: 0,
          COMPLETED: 0,
          CANCELLED: 0,
          NO_SHOW: 0,
        },
      });
    });
  });

  it.each(Object.values(MembershipRole))('allows %s with dashboard.read', async (role) => {
    membershipRole = role;
    await authorizedGet().expect(200);
  });

  it('allows archived Business historical reads', async () => {
    currentBusiness = business(BusinessStatus.ARCHIVED);
    await authorizedGet().expect(200);
  });

  it.each([
    ['', 400],
    ['from=2026-09-01', 400],
    ['to=2026-09-02', 400],
    ['from=invalid&to=2026-09-02', 400],
    ['from=2026-02-30&to=2026-03-02', 400],
    ['from=2026-09-02&to=2026-09-02', 400],
    ['from=2026-09-03&to=2026-09-02', 400],
    ['from=2026-01-01&to=2026-02-02', 400],
  ])('rejects invalid required period %s', async (query, status) => {
    await authorizedGet(businessId, query).expect(status);
  });

  it('returns 401 without JWT and 403 without Membership', async () => {
    await request(app.getHttpServer()).get(endpoint()).expect(401);
    membershipRole = null;
    await authorizedGet().expect(403);
  });

  it('keeps tenant authorization separate from Business lookup', async () => {
    await authorizedGet(otherBusinessId).expect(403);
    membershipBusinessId = missingBusinessId;
    await authorizedGet(missingBusinessId).expect(404);
  });
});
