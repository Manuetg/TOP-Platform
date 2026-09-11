import {
  PrismaClient,
  type BookingStatus,
} from '@prisma/client';
import { GetRevenueKpiUseCase, RevenueKpiInvariantError } from '../../src/modules/dashboard/application/get-revenue-kpi.use-case';
import { BusinessStatus } from '../../src/modules/business/business.contract';
import { Business } from '../../src/modules/business/domain/business.entity';
import type { BusinessRepository } from '../../src/modules/business/domain/business.repository';
import { PrismaRevenueProjectionReader } from '../../src/modules/payment/infrastructure/prisma-revenue-projection.reader';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test')
  ? describe
  : describe.skip;

describeWithPostgres('PrismaRevenueProjectionReader', () => {
  const prisma = new PrismaClient();
  const reader = new PrismaRevenueProjectionReader(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  async function createBusiness(
    name = 'Revenue',
    timezone = 'America/Asuncion',
    status: BusinessStatus = BusinessStatus.ACTIVE,
  ) {
    return prisma.business.create({
      data: {
        name: `${name}-${crypto.randomUUID()}`,
        timezone,
        currency: 'PYG',
        status,
      },
    });
  }

  async function createBooking(
    businessId: string,
    status: BookingStatus = 'CONFIRMED',
  ) {
    return prisma.booking.create({ data: { businessId, status } });
  }

  async function createPayment(input: {
    businessId: string;
    bookingId: string;
    amountMinor: number;
    paidAt: Date;
    createdAt?: Date;
    currency?: string;
  }): Promise<void> {
    const id = crypto.randomUUID();
    await prisma.payment.create({
      data: {
        id,
        businessId: input.businessId,
        bookingId: input.bookingId,
        amountMinor: input.amountMinor,
        currency: input.currency ?? 'PYG',
        method: 'CASH',
        paidAt: input.paidAt,
        recordedByUserId: crypto.randomUUID(),
        status: 'RECORDED',
        idempotencyKey: `revenue-${id}`,
        requestFingerprint: `fingerprint-${id}`,
        createdAt: input.createdAt,
      },
    });
  }

  function read(
    businessId: string,
    from = '2026-09-10',
    to = '2026-09-11',
    timeZone = 'America/Asuncion',
  ) {
    return reader.read({ businessId, from, to, timeZone });
  }

  it('returns an empty projection for a Business without recorded Payments', async () => {
    const business = await createBusiness();
    await expect(read(business.id)).resolves.toEqual({ amounts: [] });
  });

  it('sums multiple RECORDED Payments exactly once without row multiplication', async () => {
    const business = await createBusiness();
    const booking = await createBooking(business.id);
    await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 200_000, paidAt: new Date('2026-09-10T12:00:00Z') });
    await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 350_000, paidAt: new Date('2026-09-10T15:00:00Z') });
    await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 150_000, paidAt: new Date('2026-09-10T18:00:00Z') });
    await expect(read(business.id)).resolves.toEqual({
      amounts: [{ currency: 'PYG', amountMinor: 700_000 }],
    });
  });

  it('uses the Business-local [from,to) boundaries in America/Asuncion', async () => {
    const business = await createBusiness();
    const booking = await createBooking(business.id);
    const rows = [
      ['2026-09-10T02:59:59.999Z', 1],
      ['2026-09-10T03:00:00.000Z', 10],
      ['2026-09-11T02:59:59.999Z', 100],
      ['2026-09-11T03:00:00.000Z', 1_000],
    ] as const;
    for (const [paidAt, amountMinor] of rows) {
      await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor, paidAt: new Date(paidAt) });
    }
    await expect(read(business.id)).resolves.toEqual({
      amounts: [{ currency: 'PYG', amountMinor: 110 }],
    });
  });

  it('applies a non-UTC IANA timezone instead of treating dates as UTC', async () => {
    const business = await createBusiness('New York', 'America/New_York');
    const booking = await createBooking(business.id);
    await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 10, paidAt: new Date('2026-09-10T03:59:59.999Z') });
    await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 20, paidAt: new Date('2026-09-10T04:00:00.000Z') });
    await expect(read(business.id, '2026-09-10', '2026-09-11', business.timezone)).resolves.toEqual({
      amounts: [{ currency: 'PYG', amountMinor: 20 }],
    });
  });

  it('uses paidAt rather than createdAt to select the financial period', async () => {
    const business = await createBusiness();
    const booking = await createBooking(business.id);
    await createPayment({
      businessId: business.id,
      bookingId: booking.id,
      amountMinor: 100,
      paidAt: new Date('2026-09-09T12:00:00Z'),
      createdAt: new Date('2026-09-10T12:00:00Z'),
    });
    await createPayment({
      businessId: business.id,
      bookingId: booking.id,
      amountMinor: 200,
      paidAt: new Date('2026-09-10T12:00:00Z'),
      createdAt: new Date('2026-09-12T12:00:00Z'),
    });
    await expect(read(business.id)).resolves.toEqual({
      amounts: [{ currency: 'PYG', amountMinor: 200 }],
    });
  });

  it.each<BookingStatus>([
    'DRAFT',
    'PENDING',
    'CONFIRMED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ])(
    'counts a Payment whose Booking is currently %s',
    async (status) => {
      const business = await createBusiness(status);
      const booking = await createBooking(business.id, status);
      await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 125, paidAt: new Date('2026-09-10T12:00:00Z') });
      await expect(read(business.id)).resolves.toEqual({
        amounts: [{ currency: 'PYG', amountMinor: 125 }],
      });
    },
  );

  it('keeps tenants isolated and excludes Payments outside the period', async () => {
    const owner = await createBusiness('Owner');
    const other = await createBusiness('Other');
    const ownerBooking = await createBooking(owner.id);
    const otherBooking = await createBooking(other.id);
    await createPayment({ businessId: owner.id, bookingId: ownerBooking.id, amountMinor: 300, paidAt: new Date('2026-09-10T12:00:00Z') });
    await createPayment({ businessId: owner.id, bookingId: ownerBooking.id, amountMinor: 500, paidAt: new Date('2026-09-09T12:00:00Z') });
    await createPayment({ businessId: other.id, bookingId: otherBooking.id, amountMinor: 900, paidAt: new Date('2026-09-10T12:00:00Z') });
    await expect(read(owner.id)).resolves.toEqual({
      amounts: [{ currency: 'PYG', amountMinor: 300 }],
    });
  });

  it('allows historical reads for an archived Business', async () => {
    const business = await createBusiness(
      'Archived',
      'America/Asuncion',
      BusinessStatus.ARCHIVED,
    );
    const booking = await createBooking(business.id, 'COMPLETED');
    await createPayment({ businessId: business.id, bookingId: booking.id, amountMinor: 450, paidAt: new Date('2026-09-10T12:00:00Z') });
    await expect(read(business.id)).resolves.toEqual({
      amounts: [{ currency: 'PYG', amountMinor: 450 }],
    });
  });

  it('surfaces persisted currencies independently so Application detects the invariant', async () => {
    const businessRow = await createBusiness();
    const booking = await createBooking(businessRow.id);
    await createPayment({ businessId: businessRow.id, bookingId: booking.id, amountMinor: 100, paidAt: new Date('2026-09-10T12:00:00Z') });
    await createPayment({ businessId: businessRow.id, bookingId: booking.id, amountMinor: 200, paidAt: new Date('2026-09-10T13:00:00Z'), currency: 'USD' });

    const businessRepository: BusinessRepository = {
      create: jest.fn(),
      findById: async (id) => {
        const row = await prisma.business.findUnique({ where: { id } });
        return row
          ? Business.create({
            ...row,
            status: row.status as BusinessStatus,
          })
          : null;
      },
      list: jest.fn(),
      update: jest.fn(),
    };
    const useCase = new GetRevenueKpiUseCase(businessRepository, reader);
    await expect(useCase.execute({
      businessId: businessRow.id,
      from: '2026-09-10',
      to: '2026-09-11',
    })).rejects.toBeInstanceOf(RevenueKpiInvariantError);
  });
});
