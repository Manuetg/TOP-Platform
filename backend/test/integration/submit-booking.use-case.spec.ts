import { PrismaClient } from '@prisma/client';
import { SubmitBookingUseCase } from '../../src/modules/booking-lifecycle/application/submit-booking.use-case';
import { BookingAvailabilityConflictError, BookingNotFoundError } from '../../src/modules/booking/application/booking.errors';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { PrismaBlockRepository } from '../../src/modules/block/infrastructure/prisma-block.repository';
import { PrismaAvailabilityRulesRepository } from '../../src/modules/availability/infrastructure/prisma-availability-rules.repository';
import { CheckAvailabilityUseCase } from '../../src/modules/availability/application/check-availability.use-case';
import { ValidateOverbookingUseCase } from '../../src/modules/availability/application/validate-overbooking.use-case';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { BlockType } from '../../src/modules/block/domain/block-type.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('SubmitBookingUseCase', () => {
  const prisma = new PrismaClient();
  const businesses = new PrismaBusinessRepository(prisma);
  const contacts = new PrismaContactRepository(prisma);
  const resources = new PrismaResourceRepository(prisma);
  const bookings = new PrismaBookingRepository(prisma);
  const blocks = new PrismaBlockRepository(prisma);
  const rules = new PrismaAvailabilityRulesRepository(prisma);
  const availability = new ValidateOverbookingUseCase(
    new CheckAvailabilityUseCase(businesses, resources, bookings, blocks, rules),
  );
  const useCase = new SubmitBookingUseCase(
    businesses,
    contacts,
    bookings,
    availability,
  );

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function fixture(name: string) {
    const business = await prisma.business.create({ data: { name } });
    const contact = await prisma.contact.create({
      data: { businessId: business.id, name: `${name} Contact`, email: `${name.toLowerCase()}@test.local` },
    });
    const resource = await prisma.resource.create({
      data: { businessId: business.id, name: `${name} Room`, internalCode: name.toUpperCase(), capacityMaximum: 2 },
    });
    const booking = await bookings.create({
      businessId: business.id,
      contactId: contact.id,
      resourceIds: [resource.id],
      checkInDate: new Date('2026-06-10'),
      checkOutDate: new Date('2026-06-12'),
      adults: null,
      children: null,
      notes: null,
    });
    return { business, contact, resource, booking };
  }

  it('persists the DRAFT to PENDING after real availability validation', async () => {
    const { business, booking } = await fixture('Owner');

    await expect(useCase.execute({ businessId: business.id, bookingId: booking.id })).resolves.toMatchObject({ id: booking.id, status: BookingStatus.PENDING });
    await expect(prisma.booking.findUnique({ where: { id: booking.id } })).resolves.toMatchObject({ status: BookingStatus.PENDING });
  });

  it('keeps the DRAFT when an intersecting blocking booking conflicts', async () => {
    const { business, resource, booking } = await fixture('Booking conflict');
    const blocker = await bookings.create({ businessId: business.id, contactId: null, resourceIds: [resource.id], checkInDate: new Date('2026-06-09'), checkOutDate: new Date('2026-06-11'), adults: null, children: null, notes: null });
    await bookings.markPending(blocker.id);

    await expect(useCase.execute({ businessId: business.id, bookingId: booking.id })).rejects.toBeInstanceOf(BookingAvailabilityConflictError);
    await expect(prisma.booking.findUnique({ where: { id: booking.id } })).resolves.toMatchObject({ status: BookingStatus.DRAFT });
  });

  it('keeps the DRAFT when an intersecting scheduled block conflicts', async () => {
    const { business, resource, booking } = await fixture('Block conflict');
    await prisma.block.create({ data: { businessId: business.id, resourceId: resource.id, type: BlockType.MAINTENANCE, reason: 'Maintenance', startsAt: new Date('2026-06-10T00:00:00.000Z'), endsAt: new Date('2026-06-11T00:00:00.000Z') } });

    await expect(useCase.execute({ businessId: business.id, bookingId: booking.id })).rejects.toBeInstanceOf(BookingAvailabilityConflictError);
    await expect(prisma.booking.findUnique({ where: { id: booking.id } })).resolves.toMatchObject({ status: BookingStatus.DRAFT });
  });

  it('hides a booking owned by another tenant', async () => {
    const owner = await fixture('Owner');
    const other = await fixture('Other');

    await expect(useCase.execute({ businessId: other.business.id, bookingId: owner.booking.id })).rejects.toBeInstanceOf(BookingNotFoundError);
    await expect(prisma.booking.findUnique({ where: { id: owner.booking.id } })).resolves.toMatchObject({ status: BookingStatus.DRAFT });
  });
});
