import { PrismaClient } from '@prisma/client';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
describeWithPostgres('PrismaBookingRepository', () => {
  const prisma = new PrismaClient(); const repository = new PrismaBookingRepository(prisma);
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  async function fixture(name: string) { const business = await prisma.business.create({ data: { name } }); const resources = await Promise.all(['A', 'B'].map((code) => prisma.resource.create({ data: { businessId: business.id, name: `Resource ${code}`, internalCode: `${name}${code}`, capacityMaximum: 2 } }))); return { business, resources }; }
  it('creates, reads, filters and atomically replaces tenant-scoped booking resources', async () => { const { business, resources } = await fixture('Owner'); const created = await repository.create({ businessId: business.id, contactId: null, resourceIds: resources.map((resource) => resource.id), checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-03'), adults: 2, children: null, notes: null }); expect(created.resourceIds).toEqual(resources.map((resource) => resource.id).sort()); await expect(repository.findByIdAndBusinessId(created.id, business.id)).resolves.toMatchObject({ status: BookingStatus.DRAFT, adults: 2 }); await expect(repository.listByBusinessId(business.id, { status: BookingStatus.DRAFT, contactId: null, resourceId: resources[0].id })).resolves.toHaveLength(1); const replacement = (await repository.findByIdAndBusinessId(created.id, business.id))!; const updated = (await repository.update(replacement, true)); expect(updated.resourceIds).toEqual(replacement.resourceIds); });
  it('does not expose bookings to another business', async () => { const owner = await fixture('Owner'); const other = await fixture('Other'); const created = await repository.create({ businessId: owner.business.id, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null }); await expect(repository.findByIdAndBusinessId(created.id, other.business.id)).resolves.toBeNull(); });
  it('detects only tenant-scoped blocking booking statuses with semi-open boundaries', async () => {
    const owner = await fixture('Owner'); const other = await fixture('Other'); const from = new Date('2026-04-02'); const to = new Date('2026-04-04');
    const blocking = await repository.create({ businessId: owner.business.id, contactId: null, resourceIds: [owner.resources[0].id], checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-03'), adults: null, children: null, notes: null });
    await prisma.booking.update({ where: { id: blocking.id }, data: { status: BookingStatus.CONFIRMED } });
    const draft = await repository.create({ businessId: owner.business.id, contactId: null, resourceIds: [owner.resources[1].id], checkInDate: from, checkOutDate: to, adults: null, children: null, notes: null });
    const foreign = await repository.create({ businessId: other.business.id, contactId: null, resourceIds: [other.resources[0].id], checkInDate: from, checkOutDate: to, adults: null, children: null, notes: null });
    await prisma.booking.update({ where: { id: foreign.id }, data: { status: BookingStatus.PENDING } });
    await expect(repository.hasBlockingBooking(owner.business.id, owner.resources[0].id, from, to)).resolves.toBe(true);
    await expect(repository.hasBlockingBooking(owner.business.id, owner.resources[1].id, from, to)).resolves.toBe(false);
    await expect(repository.hasBlockingBooking(other.business.id, owner.resources[0].id, from, to)).resolves.toBe(false);
    await expect(repository.hasBlockingBooking(owner.business.id, owner.resources[0].id, new Date('2026-04-03'), to)).resolves.toBe(false);
    expect(draft.id).toBeDefined();
  });
});
