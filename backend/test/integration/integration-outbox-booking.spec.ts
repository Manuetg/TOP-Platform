import { PrismaClient } from '@prisma/client';
import { CancelBookingUseCase } from '../../src/modules/booking-lifecycle/application/cancel-booking.use-case';
import { PrismaBookingConfirmationTransaction } from '../../src/modules/booking-lifecycle/infrastructure/prisma-booking-confirmation.transaction';
import { BookingStatus } from '../../src/modules/booking/domain/booking-status.enum';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import type { IntegrationEventOutbox } from '../../src/shared/integration-events/integration-event.outbox';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Booking integration events and transactional outbox', () => {
  const prisma = new PrismaClient();
  const bookings = new PrismaBookingRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function draft() {
    const business = await prisma.business.create({
      data: { name: `Business ${crypto.randomUUID()}` },
    });
    const booking = await bookings.create({
      businessId: business.id,
      contactId: null,
      resourceIds: [],
      checkInDate: null,
      checkOutDate: null,
      adults: null,
      children: null,
      notes: null,
    });
    return { business, booking };
  }

  it('creates a tenant-scoped BOOKING_CREATED event with version 1', async () => {
    const { business, booking } = await draft();

    const events = await prisma.integrationOutboxEvent.findMany({ where: { businessId: business.id } });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'BOOKING_CREATED',
      payloadVersion: 1,
      businessId: business.id,
      aggregateType: 'BOOKING',
      aggregateId: booking.id,
      payload: { bookingId: booking.id, status: 'DRAFT' },
    });
  });

  it('creates BOOKING_CONFIRMED in the same confirmation transaction', async () => {
    const { business, booking } = await draft();
    await bookings.markPending(booking.id, business.id, null);
    const confirmation = new PrismaBookingConfirmationTransaction(prisma);

    await expect(confirmation.confirm({
      businessId: business.id,
      bookingId: booking.id,
      actorUserId: null,
      prepare: () => Promise.resolve({ currency: 'PYG', totalAmountMinor: 1, items: [] }),
    })).resolves.toBe('CONFIRMED');

    await expect(prisma.integrationOutboxEvent.findFirst({ where: { businessId: business.id, eventType: 'BOOKING_CONFIRMED' } })).resolves.toMatchObject({
      payloadVersion: 1,
      aggregateId: booking.id,
      payload: { bookingId: booking.id, status: 'CONFIRMED' },
    });
    await expect(prisma.booking.findUnique({ where: { id: booking.id } })).resolves.toMatchObject({ status: BookingStatus.CONFIRMED });
  });

  it('creates BOOKING_CANCELLED and does not duplicate it on an idempotent retry', async () => {
    const { business, booking } = await draft();
    const businesses = new PrismaBusinessRepository(prisma);
    const cancel = new CancelBookingUseCase(businesses, bookings);

    await cancel.execute({ businessId: business.id, bookingId: booking.id, reason: 'Cambio de planes' });
    await cancel.execute({ businessId: business.id, bookingId: booking.id, reason: 'Otro motivo ignorado' });

    const events = await prisma.integrationOutboxEvent.findMany({ where: { businessId: business.id, aggregateId: booking.id, eventType: 'BOOKING_CANCELLED' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      payloadVersion: 1,
      payload: { bookingId: booking.id, status: 'CANCELLED', reason: 'Cambio de planes' },
    });
  });

  it('keeps eventId unique across events and Businesses isolated', async () => {
    const first = await draft();
    const second = await draft();
    const events = await prisma.integrationOutboxEvent.findMany({ orderBy: { createdAt: 'asc' } });

    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length);
    expect(events.map((event) => event.businessId)).toEqual(expect.arrayContaining([first.business.id, second.business.id]));
    expect(events.find((event) => event.businessId === first.business.id)?.aggregateId).toBe(first.booking.id);
    expect(events.find((event) => event.businessId === second.business.id)?.aggregateId).toBe(second.booking.id);
  });

  it('rolls back the domain change when Outbox insertion fails', async () => {
    const failingOutbox: IntegrationEventOutbox = {
      append: jest.fn().mockRejectedValue(new Error('forced outbox failure')),
    };
    const failingBookings = new PrismaBookingRepository(prisma, failingOutbox);
    const business = await prisma.business.create({ data: { name: `Business ${crypto.randomUUID()}` } });

    await expect(failingBookings.create({
      businessId: business.id,
      contactId: null,
      resourceIds: [],
      checkInDate: null,
      checkOutDate: null,
      adults: null,
      children: null,
      notes: null,
    })).rejects.toThrow('forced outbox failure');

    await expect(prisma.booking.count({ where: { businessId: business.id } })).resolves.toBe(0);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: business.id } })).resolves.toBe(0);
  });

  it('rolls back confirmation, snapshot, timeline and Outbox when Outbox insertion fails', async () => {
    const value = await draft();
    await bookings.markPending(value.booking.id, value.business.id, null);
    const failingOutbox: IntegrationEventOutbox = {
      append: jest.fn().mockRejectedValue(new Error('forced confirmation outbox failure')),
    };
    const confirmation = new PrismaBookingConfirmationTransaction(prisma, failingOutbox);

    await expect(confirmation.confirm({
      businessId: value.business.id,
      bookingId: value.booking.id,
      actorUserId: null,
      prepare: () => Promise.resolve({ currency: 'PYG', totalAmountMinor: 1, items: [] }),
    })).rejects.toThrow('forced confirmation outbox failure');

    await expect(prisma.booking.findUnique({ where: { id: value.booking.id } })).resolves.toMatchObject({ status: BookingStatus.PENDING });
    await expect(prisma.pricingSnapshot.count({ where: { bookingId: value.booking.id } })).resolves.toBe(0);
    await expect(prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CONFIRMED' } })).resolves.toBe(0);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: value.business.id, eventType: 'BOOKING_CONFIRMED' } })).resolves.toBe(0);
  });

  it('rolls back cancellation and Outbox when Outbox insertion fails', async () => {
    const value = await draft();
    const failingOutbox: IntegrationEventOutbox = {
      append: jest.fn().mockRejectedValue(new Error('forced cancellation outbox failure')),
    };
    const failingBookings = new PrismaBookingRepository(prisma, failingOutbox);

    await expect(failingBookings.markCancelled(value.booking.id, value.business.id, null, 'Motivo')).rejects.toThrow('forced cancellation outbox failure');

    await expect(prisma.booking.findUnique({ where: { id: value.booking.id } })).resolves.toMatchObject({ status: BookingStatus.DRAFT });
    await expect(prisma.bookingTimelineEvent.count({ where: { bookingId: value.booking.id, type: 'BOOKING_CANCELLED' } })).resolves.toBe(0);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: value.business.id, eventType: 'BOOKING_CANCELLED' } })).resolves.toBe(0);
  });
});
