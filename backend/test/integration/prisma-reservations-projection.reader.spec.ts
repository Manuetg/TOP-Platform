import {
  PrismaClient,
  type BookingStatus,
  type BusinessStatus,
} from '@prisma/client';
import { PrismaReservationsProjectionReader } from '../../src/modules/booking/infrastructure/prisma-reservations-projection.reader';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test')
  ? describe
  : describe.skip;

describeWithPostgres('PrismaReservationsProjectionReader', () => {
  const prisma = new PrismaClient();
  const reader = new PrismaReservationsProjectionReader(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  async function createBusiness(
    name = 'Reservations',
    timezone = 'America/Asuncion',
    status: BusinessStatus = 'ACTIVE',
  ) {
    return prisma.business.create({
      data: {
        name: `${name}-${crypto.randomUUID()}`,
        timezone,
        status,
      },
    });
  }

  async function createBooking(input: {
    businessId: string;
    status?: BookingStatus;
    createdAt: Date;
    checkInDate?: Date;
    checkOutDate?: Date;
    resourceIds?: string[];
    contactId?: string;
  }) {
    return prisma.booking.create({
      data: {
        businessId: input.businessId,
        status: input.status ?? 'DRAFT',
        createdAt: input.createdAt,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        contactId: input.contactId,
        resources: input.resourceIds
          ? {
              create: input.resourceIds.map((resourceId) => ({ resourceId })),
            }
          : undefined,
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

  it('returns an empty projection for a Business without Bookings', async () => {
    const business = await createBusiness();
    await expect(read(business.id)).resolves.toEqual([]);
  });

  it('groups every current Booking status and counts each Booking once', async () => {
    const business = await createBusiness();
    const statuses: BookingStatus[] = [
      'DRAFT',
      'PENDING',
      'CONFIRMED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    for (const status of statuses) {
      await createBooking({
        businessId: business.id,
        status,
        createdAt: new Date('2026-09-10T12:00:00.000Z'),
      });
    }
    const projection = await read(business.id);
    expect(projection).toHaveLength(7);
    expect(projection).toEqual(expect.arrayContaining(
      statuses.map((status) => ({ status, count: 1 })),
    ));
    expect(projection.reduce((total, row) => total + row.count, 0)).toBe(7);
  });

  it('uses Business-local [from,to) boundaries in America/Asuncion', async () => {
    const business = await createBusiness();
    const rows = [
      ['2026-09-10T02:59:59.999Z', 'DRAFT'],
      ['2026-09-10T03:00:00.000Z', 'PENDING'],
      ['2026-09-11T02:59:59.999Z', 'CONFIRMED'],
      ['2026-09-11T03:00:00.000Z', 'COMPLETED'],
    ] as const;
    for (const [createdAt, status] of rows) {
      await createBooking({
        businessId: business.id,
        status,
        createdAt: new Date(createdAt),
      });
    }
    const projection = await read(business.id);
    expect(projection).toHaveLength(2);
    expect(projection).toEqual(expect.arrayContaining([
      { status: 'CONFIRMED', count: 1 },
      { status: 'PENDING', count: 1 },
    ]));
  });

  it('applies another non-UTC IANA timezone near midnight', async () => {
    const business = await createBusiness('New York', 'America/New_York');
    await createBooking({
      businessId: business.id,
      createdAt: new Date('2026-09-10T03:59:59.999Z'),
    });
    await createBooking({
      businessId: business.id,
      createdAt: new Date('2026-09-10T04:00:00.000Z'),
    });
    await expect(read(
      business.id,
      '2026-09-10',
      '2026-09-11',
      business.timezone,
    )).resolves.toEqual([{ status: 'DRAFT', count: 1 }]);
  });

  it('uses current status for the createdAt cohort without Timeline reconstruction', async () => {
    const business = await createBusiness();
    const booking = await createBooking({
      businessId: business.id,
      status: 'DRAFT',
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
    });
    await expect(read(business.id)).resolves.toEqual([
      { status: 'CANCELLED', count: 1 },
    ]);
  });

  it('ignores stay dates and counts a multi-resource Booking only once', async () => {
    const business = await createBusiness();
    const resources = await Promise.all(['ONE', 'TWO', 'THREE'].map((code) =>
      prisma.resource.create({
        data: {
          businessId: business.id,
          name: code,
          internalCode: code,
          capacityMaximum: 2,
        },
      }),
    ));
    await createBooking({
      businessId: business.id,
      status: 'CONFIRMED',
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
      checkInDate: new Date('2026-12-01T00:00:00.000Z'),
      checkOutDate: new Date('2026-12-05T00:00:00.000Z'),
      resourceIds: resources.map((resource) => resource.id),
    });
    await expect(read(business.id)).resolves.toEqual([
      { status: 'CONFIRMED', count: 1 },
    ]);
  });

  it('does not join Contact and remains valid with or without one', async () => {
    const business = await createBusiness();
    const contact = await prisma.contact.create({
      data: {
        businessId: business.id,
        name: 'Ana',
        lastName: 'Demo',
        phone: '+595981000001',
      },
    });
    await createBooking({
      businessId: business.id,
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    await createBooking({
      businessId: business.id,
      contactId: contact.id,
      createdAt: new Date('2026-09-10T13:00:00.000Z'),
    });
    await expect(read(business.id)).resolves.toEqual([
      { status: 'DRAFT', count: 2 },
    ]);
  });

  it('keeps tenants isolated and allows an archived Business read', async () => {
    const owner = await createBusiness('Archived', 'America/Asuncion', 'ARCHIVED');
    const other = await createBusiness('Other');
    await createBooking({
      businessId: owner.id,
      status: 'COMPLETED',
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    await createBooking({
      businessId: other.id,
      status: 'NO_SHOW',
      createdAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    await expect(read(owner.id)).resolves.toEqual([
      { status: 'COMPLETED', count: 1 },
    ]);
  });
});
