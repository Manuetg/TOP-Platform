import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, type BusinessStatus } from '@prisma/client';
import { GetBusinessDashboardUseCase } from '../../src/modules/dashboard/application/get-business-dashboard.use-case';
import { DashboardModule } from '../../src/modules/dashboard/dashboard.module';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test')
  ? describe
  : describe.skip;

describeWithPostgres('DashboardModule', () => {
  const prisma = new PrismaClient();
  let module: TestingModule;
  let dashboard: GetBusinessDashboardUseCase;

  beforeAll(async () => {
    await prisma.$connect();
    module = await Test.createTestingModule({ imports: [DashboardModule] })
      .compile();
    dashboard = module.get(GetBusinessDashboardUseCase);
  });
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await module.close();
    await prisma.$disconnect();
  });

  async function createBusiness(
    name: string,
    status: BusinessStatus = 'ACTIVE',
  ) {
    return prisma.business.create({
      data: { name: `${name}-${crypto.randomUUID()}`, timezone: 'America/Asuncion', currency: 'PYG', status },
    });
  }

  async function createActivity(businessId: string, amountMinor: number) {
    const resource = await prisma.resource.create({
      data: {
        businessId,
        name: 'Cabaña',
        internalCode: `CAB-${crypto.randomUUID()}`,
        capacityMaximum: 2,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const booking = await prisma.booking.create({
      data: {
        businessId,
        status: 'CONFIRMED',
        createdAt: new Date('2026-09-10T12:00:00.000Z'),
        checkInDate: new Date('2026-09-10T00:00:00.000Z'),
        checkOutDate: new Date('2026-09-11T00:00:00.000Z'),
        resources: { create: { resourceId: resource.id } },
      },
    });
    const paymentId = crypto.randomUUID();
    await prisma.payment.create({
      data: {
        id: paymentId,
        businessId,
        bookingId: booking.id,
        amountMinor,
        currency: 'PYG',
        method: 'CASH',
        paidAt: new Date('2026-09-10T12:30:00.000Z'),
        recordedByUserId: crypto.randomUUID(),
        status: 'RECORDED',
        idempotencyKey: `dashboard-${paymentId}`,
        requestFingerprint: `fingerprint-${paymentId}`,
      },
    });
  }

  const execute = (businessId: string) => dashboard.execute({
    businessId,
    from: '2026-09-10',
    to: '2026-09-11',
  });

  it('wires and composes the three real aggregate projections for one period', async () => {
    const business = await createBusiness('Dashboard');
    await createActivity(business.id, 750_000);

    await expect(execute(business.id)).resolves.toEqual({
      occupancy: {
        occupiedResourceNights: 1,
        sellableResourceNights: 1,
        occupancyRateBasisPoints: 10_000,
      },
      revenue: { currency: 'PYG', amountMinor: 750_000 },
      reservations: {
        total: 1,
        byStatus: {
          DRAFT: 0,
          PENDING: 0,
          CONFIRMED: 1,
          IN_PROGRESS: 0,
          COMPLETED: 0,
          CANCELLED: 0,
          NO_SHOW: 0,
        },
      },
    });
  });

  it('returns coherent empty metrics for an archived Business', async () => {
    const business = await createBusiness('Archived', 'ARCHIVED');
    await expect(execute(business.id)).resolves.toMatchObject({
      occupancy: {
        occupiedResourceNights: 0,
        sellableResourceNights: 0,
        occupancyRateBasisPoints: null,
      },
      revenue: { currency: 'PYG', amountMinor: 0 },
      reservations: { total: 0 },
    });
  });

  it('keeps every composed aggregate tenant-scoped', async () => {
    const owner = await createBusiness('Owner');
    const other = await createBusiness('Other');
    await createActivity(other.id, 999_000);

    await expect(execute(owner.id)).resolves.toMatchObject({
      occupancy: { occupiedResourceNights: 0, sellableResourceNights: 0 },
      revenue: { amountMinor: 0 },
      reservations: { total: 0 },
    });
  });
});
