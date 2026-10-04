import { PrismaClient } from '@prisma/client';
import { PrismaBookingConfirmationTransaction } from '../../src/modules/booking-lifecycle/infrastructure/prisma-booking-confirmation.transaction';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { IntegrationEventDispatcher, type IntegrationEventDispatcherOptions } from '../../src/shared/integration-events/integration-event-dispatcher';
import { PrismaIntegrationOutboxRepository } from '../../src/shared/infrastructure/prisma-integration-outbox.repository';
import { cleanTestDatabase } from './support/clean-test-database';
import { FakeIntegrationEventConsumer } from './support/fake-integration-event.consumer';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Integration Outbox Dispatcher', () => {
  const prisma = new PrismaClient();
  const outbox = new PrismaIntegrationOutboxRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function pendingEvent(eventType = 'BOOKING_CONFIRMED', occurredAt = new Date()) {
    const business = await prisma.business.create({ data: { name: `Business ${crypto.randomUUID()}` } });
    const event = await prisma.integrationOutboxEvent.create({
      data: {
        eventId: crypto.randomUUID(),
        eventType,
        payloadVersion: 1,
        businessId: business.id,
        aggregateType: 'BOOKING',
        aggregateId: crypto.randomUUID(),
        occurredAt,
        availableAt: occurredAt,
        correlationId: crypto.randomUUID(),
        payload: { bookingId: crypto.randomUUID(), status: 'CONFIRMED' },
      },
    });
    return { business, event };
  }

  async function confirmedBookingEvent() {
    const business = await prisma.business.create({ data: { name: `Business ${crypto.randomUUID()}` } });
    const bookings = new PrismaBookingRepository(prisma);
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
    await bookings.markPending(booking.id, business.id, null);
    await new PrismaBookingConfirmationTransaction(prisma).confirm({
      businessId: business.id,
      bookingId: booking.id,
      actorUserId: null,
      prepare: () => Promise.resolve({ currency: 'PYG', totalAmountMinor: 1, items: [] }),
    });
    const event = await prisma.integrationOutboxEvent.findFirstOrThrow({
      where: { businessId: business.id, eventType: 'BOOKING_CONFIRMED' },
    });
    return { business, booking, event };
  }

  function dispatcher(consumer: FakeIntegrationEventConsumer, options: IntegrationEventDispatcherOptions = {}) {
    return new IntegrationEventDispatcher(outbox, [consumer], {
      baseBackoffMs: 0,
      ...options,
    });
  }

  it('transitions PENDING to PROCESSING and then PROCESSED', async () => {
    const { event } = await pendingEvent();
    const consumer = new FakeIntegrationEventConsumer();
    let processingSeen = false;
    consumer.onHandle = async () => {
      const current = await prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } });
      processingSeen = current.status === 'PROCESSING';
    };

    await expect(dispatcher(consumer).dispatchOnce()).resolves.toBe('PROCESSED');
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'PROCESSED', attemptCount: 1, processingStartedAt: null, processingToken: null });
    expect(processingSeen).toBe(true);
  });

  it('delivers BOOKING_CONFIRMED to a fake consumer and preserves businessId', async () => {
    const { business, event } = await confirmedBookingEvent();
    const consumer = new FakeIntegrationEventConsumer();

    await expect(dispatcher(consumer).dispatchOnce()).resolves.toBe('PROCESSED');
    expect(consumer.received).toHaveLength(1);
    expect(consumer.received[0]).toMatchObject({ eventId: event.eventId, eventType: 'BOOKING_CONFIRMED', businessId: business.id, payloadVersion: 1 });
  });

  it('claims an event only once when two dispatchers run concurrently', async () => {
    const { event } = await pendingEvent();
    const first = new FakeIntegrationEventConsumer();
    const second = new FakeIntegrationEventConsumer();
    first.delayMs = 50;
    second.delayMs = 50;

    const outcomes = await Promise.all([dispatcher(first).dispatchOnce(), dispatcher(second).dispatchOnce()]);
    expect(outcomes.filter((outcome) => outcome === 'PROCESSED')).toHaveLength(1);
    expect(first.received.length + second.received.length).toBe(1);
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'PROCESSED', attemptCount: 1 });
  });

  it('schedules a failed event for retry and normalizes the error', async () => {
    const { event } = await pendingEvent();
    const consumer = new FakeIntegrationEventConsumer();
    consumer.fail = true;
    const worker = dispatcher(consumer);

    await expect(worker.dispatchOnce()).resolves.toBe('RETRY_SCHEDULED');
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'PENDING', attemptCount: 1, lastError: 'forced consumer failure' });
    consumer.fail = false;
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'PROCESSED', attemptCount: 2 });
  });

  it('marks an event FAILED after the configured maximum attempts', async () => {
    const firstAttemptAt = new Date('2026-10-03T12:00:00.000Z');
    let now = firstAttemptAt;
    const { event } = await pendingEvent('BOOKING_CONFIRMED', firstAttemptAt);
    const consumer = new FakeIntegrationEventConsumer();
    consumer.fail = true;
    const worker = dispatcher(consumer, { maxAttempts: 2, baseBackoffMs: 1_000, now: () => now });

    await expect(worker.dispatchOnce()).resolves.toBe('RETRY_SCHEDULED');
    now = new Date(firstAttemptAt.getTime() + 1_000);
    await expect(worker.dispatchOnce()).resolves.toBe('FAILED');
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'FAILED', attemptCount: 2, lastError: 'forced consumer failure' });
  });

  it('recovers an abandoned PROCESSING event', async () => {
    const { event } = await pendingEvent();
    await prisma.integrationOutboxEvent.update({
      where: { eventId: event.eventId },
      data: { status: 'PROCESSING', attemptCount: 1, processingStartedAt: new Date(Date.now() - 10_000), processingToken: 'dead-worker' },
    });
    const consumer = new FakeIntegrationEventConsumer();

    await expect(dispatcher(consumer, { processingTimeoutMs: 1_000 }).dispatchOnce()).resolves.toBe('PROCESSED');
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'PROCESSED', attemptCount: 2 });
  });

  it('does not claim events that are not available yet', async () => {
    const { event } = await pendingEvent();
    await prisma.integrationOutboxEvent.update({ where: { eventId: event.eventId }, data: { availableAt: new Date(Date.now() + 60_000) } });
    const consumer = new FakeIntegrationEventConsumer();

    await expect(dispatcher(consumer).dispatchOnce()).resolves.toBe('IDLE');
    await expect(prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId: event.eventId } })).resolves.toMatchObject({ status: 'PENDING', attemptCount: 0 });
  });

  it('does not assume ordering and dispatches available events', async () => {
    const first = await pendingEvent();
    const second = await pendingEvent();
    const consumer = new FakeIntegrationEventConsumer();

    await expect(dispatcher(consumer).dispatchAvailable(2)).resolves.toBe(2);
    expect(new Set(consumer.received.map((event) => event.eventId))).toEqual(new Set([first.event.eventId, second.event.eventId]));
  });

  it('does not process an event that is already PROCESSED', async () => {
    const { event } = await pendingEvent();
    await prisma.integrationOutboxEvent.update({ where: { eventId: event.eventId }, data: { status: 'PROCESSED', processedAt: new Date() } });
    const consumer = new FakeIntegrationEventConsumer();

    await expect(dispatcher(consumer).dispatchOnce()).resolves.toBe('IDLE');
    expect(consumer.received).toHaveLength(0);
  });
});
