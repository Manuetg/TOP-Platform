import { PrismaClient, type BookingStatus, type ResourceStatus } from '@prisma/client';
import { PrismaOccupancyProjectionReader } from '../../src/modules/availability/infrastructure/prisma-occupancy-projection.reader';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('PrismaOccupancyProjectionReader', () => {
  const prisma = new PrismaClient();
  const reader = new PrismaOccupancyProjectionReader(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => prisma.$disconnect());

  async function business(name = 'Occupancy', timezone = 'America/Asuncion') {
    return prisma.business.create({ data: { name: `${name}-${crypto.randomUUID()}`, timezone } });
  }

  async function resource(
    businessId: string,
    code: string,
    status: ResourceStatus = 'ACTIVE',
    createdAt = new Date('2020-01-01T00:00:00.000Z'),
  ) {
    return prisma.resource.create({
      data: { businessId, name: code, internalCode: code, capacityMaximum: 2, status, createdAt },
    });
  }

  async function booking(
    businessId: string,
    resourceIds: string[],
    status: BookingStatus,
    checkInDate = new Date('2026-09-10T00:00:00.000Z'),
    checkOutDate = new Date('2026-09-12T00:00:00.000Z'),
  ) {
    return prisma.booking.create({
      data: {
        businessId,
        status,
        checkInDate,
        checkOutDate,
        resources: { create: resourceIds.map((resourceId) => ({ resourceId })) },
      },
    });
  }

  const read = (businessId: string, from = '2026-09-10', to = '2026-09-13', timeZone = 'America/Asuncion') =>
    reader.read({ businessId, from, to, timeZone });

  it('returns zeroes for a Business without operational inventory', async () => {
    const owner = await business();
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 0, sellableResourceNights: 0 });
  });

  it('counts ACTIVE resource-nights without subtracting Bookings from capacity', async () => {
    const owner = await business();
    const first = await resource(owner.id, 'ACTIVE-A');
    const second = await resource(owner.id, 'ACTIVE-B');
    await booking(owner.id, [first.id, second.id], 'CONFIRMED');
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 4, sellableResourceNights: 6 });
  });

  it.each([
    ['DRAFT', 0],
    ['PENDING', 0],
    ['CONFIRMED', 2],
    ['IN_PROGRESS', 2],
    ['COMPLETED', 2],
    ['CANCELLED', 0],
    ['NO_SHOW', 0],
  ] as const)('counts Booking status %s as %i occupied nights', async (status, expected) => {
    const owner = await business(status);
    const unit = await resource(owner.id, `STATUS-${status}`);
    await booking(owner.id, [unit.id], status);
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: expected, sellableResourceNights: 3 });
  });

  it('counts only the semi-open intersection with the requested period', async () => {
    const owner = await business();
    const unit = await resource(owner.id, 'BOUNDARY');
    await booking(owner.id, [unit.id], 'CONFIRMED', new Date('2026-09-09'), new Date('2026-09-11'));
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 1, sellableResourceNights: 3 });
  });

  it('removes each blocked local resource-night once without increasing occupancy', async () => {
    const owner = await business();
    const unit = await resource(owner.id, 'BLOCKED');
    const blockData = {
      businessId: owner.id,
      resourceId: unit.id,
      type: 'MAINTENANCE' as const,
      reason: 'Maintenance',
      startsAt: new Date('2026-09-10T03:00:00.000Z'),
      endsAt: new Date('2026-09-11T03:00:00.000Z'),
    };
    await prisma.block.create({ data: blockData });
    await prisma.block.create({ data: { ...blockData, reason: 'Overlap' } });
    await prisma.block.create({ data: { ...blockData, reason: 'Cancelled', status: 'CANCELLED' } });
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 0, sellableResourceNights: 2 });
  });

  it.each(['OUT_OF_SERVICE', 'ARCHIVED'] as const)(
    'excludes currently %s Resources from numerator and denominator, including historical Bookings',
    async (status) => {
      const owner = await business(status);
      const unit = await resource(owner.id, `EXCLUDED-${status}`, status);
      await booking(owner.id, [unit.id], 'COMPLETED');
      await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 0, sellableResourceNights: 0 });
    },
  );

  it('starts inventory on the Resource creation local date instead of its UTC date', async () => {
    const owner = await business('Timezone');
    await resource(owner.id, 'CREATED-LOCAL-DAY', 'ACTIVE', new Date('2026-09-11T01:00:00.000Z'));
    await expect(read(owner.id, '2026-09-10', '2026-09-12')).resolves.toEqual({ occupiedResourceNights: 0, sellableResourceNights: 2 });
  });

  it('does not include a Resource created at or after the period end', async () => {
    const owner = await business();
    await resource(owner.id, 'CREATED-AFTER', 'ACTIVE', new Date('2026-09-13T03:00:00.000Z'));
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 0, sellableResourceNights: 0 });
  });

  it('keeps tenants isolated across Resources, Bookings and Blocks', async () => {
    const owner = await business('Owner');
    const other = await business('Other');
    const ownerUnit = await resource(owner.id, 'OWNER');
    const otherUnit = await resource(other.id, 'OTHER');
    await booking(other.id, [otherUnit.id], 'CONFIRMED');
    await prisma.block.create({ data: { businessId: other.id, resourceId: otherUnit.id, type: 'OTHER', reason: 'Other tenant', startsAt: new Date('2026-09-10T03:00:00Z'), endsAt: new Date('2026-09-11T03:00:00Z') } });
    expect(ownerUnit.id).toBeDefined();
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 0, sellableResourceNights: 3 });
  });

  it('prevents row multiplication and duplicate occupied nights in inconsistent overlapping data', async () => {
    const owner = await business();
    const unit = await resource(owner.id, 'DISTINCT-NIGHTS');
    await booking(owner.id, [unit.id], 'CONFIRMED', new Date('2026-09-10'), new Date('2026-09-11'));
    await booking(owner.id, [unit.id], 'IN_PROGRESS', new Date('2026-09-10'), new Date('2026-09-11'));
    for (const reason of ['One', 'Two']) {
      await prisma.block.create({ data: { businessId: owner.id, resourceId: unit.id, type: 'OTHER', reason, startsAt: new Date('2026-09-12T03:00:00Z'), endsAt: new Date('2026-09-13T03:00:00Z') } });
    }
    await expect(read(owner.id)).resolves.toEqual({ occupiedResourceNights: 1, sellableResourceNights: 2 });
  });
});
