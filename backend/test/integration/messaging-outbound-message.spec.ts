import { PrismaClient } from '@prisma/client';
import { PrismaBookingConfirmationTransaction } from '../../src/modules/booking-lifecycle/infrastructure/prisma-booking-confirmation.transaction';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { MessagingIntegrationEventConsumer } from '../../src/modules/messaging/application/messaging-integration-event.consumer';
import { SendOutboundMessageUseCase } from '../../src/modules/messaging/application/send-outbound-message.use-case';
import { OutboundMessageStatus } from '../../src/modules/messaging/domain/outbound-message-status.enum';
import { OutboundMessageType } from '../../src/modules/messaging/domain/outbound-message-type.enum';
import { PrismaOutboundMessageRepository } from '../../src/modules/messaging/infrastructure/prisma-outbound-message.repository';
import { IntegrationEventDispatcher } from '../../src/shared/integration-events/integration-event-dispatcher';
import { IntegrationEventConsumerRegistry } from '../../src/shared/integration-events/integration-event-consumer-registry';
import type { IntegrationEvent } from '../../src/shared/integration-events/integration-event';
import { PrismaIntegrationOutboxRepository } from '../../src/shared/infrastructure/prisma-integration-outbox.repository';
import { cleanTestDatabase } from './support/clean-test-database';
import { FakeMessagingProvider } from './support/fake-messaging.provider';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Messaging outbound messages', () => {
  const prisma = new PrismaClient();
  const bookings = new PrismaBookingRepository(prisma);
  const contacts = new PrismaContactRepository(prisma);
  const messages = new PrismaOutboundMessageRepository(prisma);
  const outbox = new PrismaIntegrationOutboxRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function confirmedFixture(values: { whatsapp?: string | null; phone?: string | null } = {}) {
    const business = await prisma.business.create({ data: { name: `Business ${crypto.randomUUID()}` } });
    const contact = await prisma.contact.create({
      data: {
        businessId: business.id,
        name: 'Huésped',
        lastName: 'TOP',
        phone: values.phone ?? '+595981111111',
        whatsapp: values.whatsapp === undefined ? '+595982222222' : values.whatsapp,
        email: null,
        documentType: null,
        documentNumber: null,
        country: 'PY',
        city: 'Asunción',
      },
    });
    const booking = await bookings.create({ businessId: business.id, contactId: contact.id, resourceIds: [], checkInDate: null, checkOutDate: null, adults: 1, children: 0, notes: null });
    await bookings.markPending(booking.id, business.id, null);
    await new PrismaBookingConfirmationTransaction(prisma).confirm({
      businessId: business.id,
      bookingId: booking.id,
      actorUserId: null,
      prepare: () => Promise.resolve({ currency: 'PYG', totalAmountMinor: 1, items: [] }),
    });
    const row = await prisma.integrationOutboxEvent.findFirstOrThrow({ where: { businessId: business.id, eventType: 'BOOKING_CONFIRMED', aggregateId: booking.id } });
    return { business, contact, booking, event: toIntegrationEvent(row) };
  }

  function consumer(): MessagingIntegrationEventConsumer {
    return new MessagingIntegrationEventConsumer(bookings, contacts, messages, new IntegrationEventConsumerRegistry());
  }

  it('creates one PENDING BOOKING_CONFIRMATION message from BOOKING_CONFIRMED', async () => {
    const fixture = await confirmedFixture();

    await consumer().handle(fixture.event);

    await expect(prisma.outboundMessage.findMany({ where: { businessId: fixture.business.id } })).resolves.toMatchObject([
      expect.objectContaining({ integrationEventId: fixture.event.eventId, channel: 'WHATSAPP', messageType: 'BOOKING_CONFIRMATION', status: 'PENDING', recipient: fixture.contact.whatsapp, payload: { bookingId: fixture.booking.id, status: 'CONFIRMED' } }),
    ]);
  });

  it('deduplicates the same event by event, message type and channel', async () => {
    const fixture = await confirmedFixture();
    const messaging = consumer();

    await messaging.handle(fixture.event);
    await messaging.handle(fixture.event);

    await expect(prisma.outboundMessage.count({ where: { integrationEventId: fixture.event.eventId } })).resolves.toBe(1);
  });

  it('preserves businessId and resolves a recipient from the same Business', async () => {
    const fixture = await confirmedFixture();

    await consumer().handle(fixture.event);

    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    expect(message.businessId).toBe(fixture.business.id);
    expect(message.recipient).toBe(fixture.contact.whatsapp);
  });

  it('falls back to phone for legacy contacts without a WhatsApp value', async () => {
    const fixture = await confirmedFixture({ whatsapp: null, phone: '+595983333333' });

    await consumer().handle(fixture.event);

    await expect(prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } })).resolves.toMatchObject({ recipient: fixture.contact.phone });
  });

  it('does not resolve a booking or recipient across Businesses', async () => {
    const fixture = await confirmedFixture();
    const otherBusiness = await prisma.business.create({ data: { name: `Other ${crypto.randomUUID()}` } });
    const mismatched = { ...fixture.event, businessId: otherBusiness.id };

    await expect(consumer().handle(mismatched)).rejects.toThrow();
    await expect(prisma.outboundMessage.count()).resolves.toBe(0);
  });

  it('ignores unsupported integration events', async () => {
    const fixture = await confirmedFixture();

    await consumer().handle({ ...fixture.event, eventType: 'BOOKING_CREATED' });

    await expect(prisma.outboundMessage.count()).resolves.toBe(0);
  });

  it('runs BOOKING_CONFIRMED through Dispatcher into a PENDING OutboundMessage', async () => {
    const fixture = await confirmedFixture();
    const messaging = consumer();
    const dispatcher = new IntegrationEventDispatcher(outbox, [messaging], { baseBackoffMs: 0 });

    await expect(dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    await expect(prisma.outboundMessage.count({ where: { integrationEventId: fixture.event.eventId, status: 'PENDING' } })).resolves.toBe(1);
  });

  it('runs BOOKING_CONFIRMED through Dispatcher, Messaging and FakeMessagingProvider', async () => {
    const fixture = await confirmedFixture();
    const messaging = consumer();
    const dispatcher = new IntegrationEventDispatcher(outbox, [messaging], { baseBackoffMs: 0 });
    const provider = new FakeMessagingProvider();
    const send = new SendOutboundMessageUseCase(messages, provider);

    await expect(dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    const row = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    await expect(send.execute({ id: row.id, businessId: fixture.business.id })).resolves.toBe(`fake-provider-${row.id}`);

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ id: row.id, businessId: fixture.business.id, recipient: fixture.contact.whatsapp, messageType: OutboundMessageType.BOOKING_CONFIRMATION });
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.SENT, providerMessageId: `fake-provider-${row.id}` });
  });

  it('sends PENDING to SENT and persists providerMessageId', async () => {
    const fixture = await confirmedFixture();
    await consumer().handle(fixture.event);
    const row = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    const provider = new FakeMessagingProvider();
    const send = new SendOutboundMessageUseCase(messages, provider);

    await expect(send.execute({ id: row.id, businessId: fixture.business.id })).resolves.toBe(`fake-provider-${row.id}`);
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.SENT, providerMessageId: `fake-provider-${row.id}` });
    expect(provider.sent).toHaveLength(1);
  });

  it('marks provider failure as FAILED with a normalized error', async () => {
    const fixture = await confirmedFixture();
    await consumer().handle(fixture.event);
    const row = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    const provider = new FakeMessagingProvider();
    provider.fail = true;
    const send = new SendOutboundMessageUseCase(messages, provider);

    await expect(send.execute({ id: row.id, businessId: fixture.business.id })).rejects.toThrow('forced messaging provider failure');
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.FAILED, lastError: 'forced messaging provider failure' });
  });

  it('retries the same OutboundMessage without creating another record', async () => {
    const fixture = await confirmedFixture();
    await consumer().handle(fixture.event);
    const row = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    const provider = new FakeMessagingProvider();
    const send = new SendOutboundMessageUseCase(messages, provider);
    provider.fail = true;
    await expect(send.execute({ id: row.id, businessId: fixture.business.id })).rejects.toThrow();
    provider.fail = false;

    await expect(send.execute({ id: row.id, businessId: fixture.business.id })).resolves.toBe(`fake-provider-${row.id}`);
    await expect(prisma.outboundMessage.count({ where: { integrationEventId: fixture.event.eventId } })).resolves.toBe(1);
  });

  it('does not send an already SENT message again', async () => {
    const fixture = await confirmedFixture();
    await consumer().handle(fixture.event);
    const row = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    const provider = new FakeMessagingProvider();
    const send = new SendOutboundMessageUseCase(messages, provider);
    await send.execute({ id: row.id, businessId: fixture.business.id });
    await send.execute({ id: row.id, businessId: fixture.business.id });

    expect(provider.sent).toHaveLength(1);
  });
});

function toIntegrationEvent(row: {
  eventId: string;
  eventType: string;
  payloadVersion: number;
  businessId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  correlationId: string;
  payload: unknown;
}): IntegrationEvent {
  return { ...row, payload: row.payload as IntegrationEvent['payload'] };
}
