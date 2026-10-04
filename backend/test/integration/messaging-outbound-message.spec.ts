import { PrismaClient } from '@prisma/client';
import { PrismaBookingConfirmationTransaction } from '../../src/modules/booking-lifecycle/infrastructure/prisma-booking-confirmation.transaction';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { PrismaPricingSnapshotRepository } from '../../src/modules/pricing/infrastructure/prisma-pricing-snapshot.repository';
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
import { MessagingAutomationType } from '../../src/modules/messaging/domain/messaging-automation-type.enum';
import { MessagingAutomationConfigurationService, type MessagingAutomationConfigurationReader } from '../../src/modules/messaging/application/messaging-automation-configuration';
import { MessagingChannel } from '../../src/modules/messaging/domain/messaging-channel.enum';
import { PrismaMessagingAutomationRuleRepository } from '../../src/modules/messaging/infrastructure/prisma-messaging-automation-rule.repository';
import { PrismaMessagingMessageTemplateRepository } from '../../src/modules/messaging/infrastructure/prisma-messaging-message-template.repository';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Messaging outbound messages', () => {
  const prisma = new PrismaClient();
  const bookings = new PrismaBookingRepository(prisma);
  const businesses = new PrismaBusinessRepository(prisma);
  const contacts = new PrismaContactRepository(prisma);
  const resources = new PrismaResourceRepository(prisma);
  const snapshots = new PrismaPricingSnapshotRepository(prisma);
  const messages = new PrismaOutboundMessageRepository(prisma);
  const outbox = new PrismaIntegrationOutboxRepository(prisma);
  const automationRules = new PrismaMessagingAutomationRuleRepository(prisma);
  const messageTemplates = new PrismaMessagingMessageTemplateRepository(prisma);

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
        phone: values.phone === undefined ? '+595981111111' : values.phone,
        whatsapp: values.whatsapp === undefined ? '+595982222222' : values.whatsapp,
        email: null,
        documentType: null,
        documentNumber: null,
        country: 'PY',
        city: 'Asunción',
      },
    });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabaña Premium', internalCode: `PREMIUM-${crypto.randomUUID()}`, capacityMaximum: 4 } });
    const booking = await bookings.create({ businessId: business.id, contactId: contact.id, resourceIds: [resource.id], checkInDate: new Date('2026-10-15'), checkOutDate: new Date('2026-10-17'), adults: 4, children: 0, notes: null });
    await bookings.markPending(booking.id, business.id, null);
    await new PrismaBookingConfirmationTransaction(prisma).confirm({
      businessId: business.id,
      bookingId: booking.id,
      actorUserId: null,
      prepare: () => Promise.resolve({ currency: 'PYG', totalAmountMinor: 1250000, items: [{ resourceId: resource.id, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, agreedAmountMinor: 1250000, adjustmentAmountMinor: null, overrideReason: 'Prueba', nights: 2, breakdown: [] }] }),
    });
    const row = await prisma.integrationOutboxEvent.findFirstOrThrow({ where: { businessId: business.id, eventType: 'BOOKING_CONFIRMED', aggregateId: booking.id } });
    return { business, contact, resource, booking, event: toIntegrationEvent(row) };
  }

  function consumer(): MessagingIntegrationEventConsumer {
    return new MessagingIntegrationEventConsumer(bookings, businesses, contacts, resources, snapshots, messages, new IntegrationEventConsumerRegistry());
  }

  function consumerWithConfiguration(configuration: MessagingAutomationConfigurationReader): MessagingIntegrationEventConsumer {
    return new MessagingIntegrationEventConsumer(bookings, businesses, contacts, resources, snapshots, messages, new IntegrationEventConsumerRegistry(), configuration);
  }

  it('creates one PENDING BOOKING_CONFIRMATION message from BOOKING_CONFIRMED', async () => {
    const fixture = await confirmedFixture();

    await consumer().handle(fixture.event);

    const pendingMessages = await prisma.outboundMessage.findMany({ where: { businessId: fixture.business.id } });
    expect(pendingMessages).toHaveLength(1);
    expect(pendingMessages[0]).toMatchObject({ integrationEventId: fixture.event.eventId, channel: 'WHATSAPP', messageType: 'BOOKING_CONFIRMATION', status: 'PENDING', recipient: fixture.contact.whatsapp, payload: expect.objectContaining({ bookingId: fixture.booking.id, status: 'CONFIRMED' }) });
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } });
    const text = (message.payload as { text: string }).text;
    expect(text).toContain(`Tu reserva en ${fixture.business.name} fue confirmada.`);
    expect(text).toContain('Cabaña Premium');
    expect(text).toContain('15/10/2026 → 17/10/2026');
    expect(text).toContain('4 huéspedes');
    expect(text).toContain('1.250.000 Gs.');
    expect(text).not.toContain(fixture.resource.id);
    expect(text).not.toContain(fixture.booking.id);
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

  it('does not use a Contact belonging to another Business', async () => {
    const fixture = await confirmedFixture();
    const otherBusiness = await prisma.business.create({ data: { name: `Other contact ${crypto.randomUUID()}` } });
    const foreignContact = await prisma.contact.create({ data: { businessId: otherBusiness.id, name: 'Foreign', whatsapp: '+595984444444' } });
    await prisma.booking.update({ where: { id: fixture.booking.id }, data: { contactId: foreignContact.id } });

    await expect(consumer().handle(fixture.event)).rejects.toThrow('El contacto del evento no existe.');
    await expect(prisma.outboundMessage.count()).resolves.toBe(0);
  });

  it('fails in a controlled way when the Contact has no WhatsApp recipient', async () => {
    const fixture = await confirmedFixture({ whatsapp: null, phone: null });

    await expect(consumer().handle(fixture.event)).rejects.toThrow('El contacto no tiene un destinatario de WhatsApp.');
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
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: fixture.booking.id } })).resolves.toMatchObject({ status: 'CONFIRMED' });
    await expect(prisma.pricingSnapshot.findUniqueOrThrow({ where: { bookingId: fixture.booking.id } })).resolves.toMatchObject({ totalAmountMinor: BigInt(1250000) });
  });

  it('sends a transactional confirmation even when the Conversation is HUMAN', async () => {
    const fixture = await confirmedFixture();
    await prisma.conversation.create({ data: { businessId: fixture.business.id, channel: 'WHATSAPP', externalParticipant: fixture.contact.whatsapp!, contactId: fixture.contact.id, mode: 'HUMAN', lastMessageAt: new Date() } });

    await consumer().handle(fixture.event);

    await expect(prisma.outboundMessage.count({ where: { integrationEventId: fixture.event.eventId, messageType: 'BOOKING_CONFIRMATION' } })).resolves.toBe(1);
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

  it('creates a configurable BOOKING_CANCELLATION without requiring a PricingSnapshot', async () => {
    const fixture = await confirmedFixture();
    await bookings.markCancelled(fixture.booking.id, fixture.business.id, null, 'Cambio de planes');
    const row = await prisma.integrationOutboxEvent.findFirstOrThrow({ where: { businessId: fixture.business.id, eventType: 'BOOKING_CANCELLED', aggregateId: fixture.booking.id } });

    await consumer().handle(toIntegrationEvent(row));

    await expect(prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: row.eventId } })).resolves.toMatchObject({ messageType: 'BOOKING_CANCELLATION', recipient: fixture.contact.whatsapp, payload: expect.objectContaining({ status: 'CANCELLED', text: expect.stringContaining('fue cancelada') }) });
  });

  it('does not create an outbound message when the automation is disabled', async () => {
    const fixture = await confirmedFixture();
    const resolve = jest.fn().mockResolvedValue({ businessId: fixture.business.id, automationType: MessagingAutomationType.BOOKING_CONFIRMED, enabled: false, templateType: MessagingAutomationType.BOOKING_CONFIRMED, content: 'ignored' });
    const configuration: MessagingAutomationConfigurationReader = {
      resolve,
    };

    await consumerWithConfiguration(configuration).handle(fixture.event);

    expect(resolve).toHaveBeenCalledWith({ businessId: fixture.business.id, automationType: MessagingAutomationType.BOOKING_CONFIRMED, channel: MessagingChannel.WHATSAPP });
    await expect(prisma.outboundMessage.count()).resolves.toBe(0);
  });

  it('renders a tenant configuration at event-consumer time', async () => {
    const fixture = await confirmedFixture();
    const configuration: MessagingAutomationConfigurationReader = {
      resolve: jest.fn().mockResolvedValue({ businessId: fixture.business.id, automationType: MessagingAutomationType.BOOKING_CONFIRMED, enabled: true, templateType: MessagingAutomationType.BOOKING_CONFIRMED, content: 'Confirmada para {{guestName}} en {{businessName}}.' }),
    };

    await consumerWithConfiguration(configuration).handle(fixture.event);

    await expect(prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } })).resolves.toMatchObject({ payload: { text: `Confirmada para ${fixture.contact.name} ${fixture.contact.lastName} en ${fixture.business.name}.` } });
  });

  it('resolves a persisted tenant template and automation rule', async () => {
    const fixture = await confirmedFixture();
    const template = await messageTemplates.save({ businessId: fixture.business.id, templateType: MessagingAutomationType.BOOKING_CONFIRMED, channel: MessagingChannel.WHATSAPP, content: 'Configurada: {{guestName}}' });
    await automationRules.save({ businessId: fixture.business.id, automationType: MessagingAutomationType.BOOKING_CONFIRMED, enabled: true, templateId: template.id });
    const configuration = new MessagingAutomationConfigurationService(automationRules, messageTemplates);

    await consumerWithConfiguration(configuration).handle(fixture.event);

    await expect(prisma.outboundMessage.findFirstOrThrow({ where: { integrationEventId: fixture.event.eventId } })).resolves.toMatchObject({ payload: { text: `Configurada: ${fixture.contact.name} ${fixture.contact.lastName}` } });
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
