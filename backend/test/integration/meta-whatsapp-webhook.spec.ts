import { PrismaClient } from '@prisma/client';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { ProcessMessagingWebhookUseCase } from '../../src/modules/messaging/application/process-messaging-webhook.use-case';
import { ReceiveInboundMessageUseCase } from '../../src/modules/messaging/application/receive-inbound-message.use-case';
import { MessagingChannel } from '../../src/modules/messaging/domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../../src/modules/messaging/domain/messaging-provider.enum';
import { OutboundMessageStatus } from '../../src/modules/messaging/domain/outbound-message-status.enum';
import { PrismaMessagingConnectionResolver } from '../../src/modules/messaging/infrastructure/prisma-messaging-connection.resolver';
import { MetaWhatsAppWebhookParser } from '../../src/modules/messaging/infrastructure/meta-whatsapp-webhook.parser';
import { PrismaOutboundMessageRepository } from '../../src/modules/messaging/infrastructure/prisma-outbound-message.repository';
import { PrismaReceiveInboundMessageTransaction } from '../../src/modules/messaging/infrastructure/prisma-receive-inbound-message.transaction';
import { PrismaIntegrationEventOutbox } from '../../src/shared/infrastructure/prisma-integration-event.outbox';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Meta WhatsApp webhook PostgreSQL', () => {
  const prisma = new PrismaClient();
  const parser = new MetaWhatsAppWebhookParser();
  const connections = new PrismaMessagingConnectionResolver(prisma);
  const messages = new PrismaOutboundMessageRepository(prisma);
  const contacts = new PrismaContactRepository(prisma);
  const receive = new ReceiveInboundMessageUseCase(contacts, new PrismaReceiveInboundMessageTransaction(prisma, new PrismaIntegrationEventOutbox()));

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function business(name: string, phoneNumberId: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
    const owner = await prisma.business.create({ data: { name: `${name} ${crypto.randomUUID()}` } });
    await prisma.messagingConnection.create({ data: { businessId: owner.id, channel: MessagingChannel.WHATSAPP, provider: MessagingConnectionProvider.META_WHATSAPP, providerPhoneNumberId: phoneNumberId, status } });
    return owner;
  }

  function handler(): ProcessMessagingWebhookUseCase {
    return new ProcessMessagingWebhookUseCase(connections, receive, messages);
  }

  it('enruta inbound TEXT al Business ACTIVE y genera Conversation, InboundMessage y Outbox', async () => {
    const owner = await business('Active', 'phone-active');

    await handler().execute(parser.parse(inboundPayload('phone-active', 'wamid-active', '595981234567', 'Hola')));

    await expect(prisma.inboundMessage.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ businessId: owner.id, providerMessageId: 'wamid-active', sender: '+595981234567', payload: { text: 'Hola' } });
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: owner.id, eventType: 'MESSAGING_INBOUND_RECEIVED' } })).resolves.toBe(1);
  });

  it('ignora conexión INACTIVE y phone_number_id desconocido sin crear datos', async () => {
    const inactive = await business('Inactive', 'phone-inactive', 'INACTIVE');

    await handler().execute(parser.parse(inboundPayload('phone-inactive', 'wamid-inactive', '595981234567', 'Ignorar')));
    await handler().execute(parser.parse(inboundPayload('phone-unknown', 'wamid-unknown', '595981234567', 'Ignorar')));

    await expect(prisma.inboundMessage.count({ where: { businessId: inactive.id } })).resolves.toBe(0);
    await expect(prisma.conversation.count()).resolves.toBe(0);
    await expect(prisma.integrationOutboxEvent.count()).resolves.toBe(0);
  });

  it('mantiene idempotencia y procesa varios mensajes del payload', async () => {
    const owner = await business('Many', 'phone-many');
    const payload = inboundPayload('phone-many', 'wamid-one', '595981234567', 'Uno');
    const root = payload as { entry: Array<{ changes: Array<{ value: { messages: unknown[] } }> }> };
    root.entry[0].changes[0].value.messages.push({ id: 'wamid-two', from: '595982345678', timestamp: '1791028801', type: 'text', text: { body: 'Dos' } });

    await handler().execute(parser.parse(payload));
    await handler().execute(parser.parse(payload));

    await expect(prisma.inboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(2);
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(2);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: owner.id, eventType: 'MESSAGING_INBOUND_RECEIVED' } })).resolves.toBe(2);
  });

  it('no mezcla Business A y B aunque compartan el mismo sender', async () => {
    const first = await business('First', 'phone-first');
    const second = await business('Second', 'phone-second');
    const payload = inboundPayload('phone-first', 'wamid-first', '595981234567', 'A');
    const root = payload as { entry: Array<{ changes: Array<{ value: { metadata: { phone_number_id: string }; messages: unknown[] } }> }> };
    root.entry.push({ changes: [{ value: { metadata: { phone_number_id: 'phone-second' }, messages: [{ id: 'wamid-second', from: '595981234567', timestamp: '1791028801', type: 'text', text: { body: 'B' } }] } }] });

    await handler().execute(parser.parse(payload));

    await expect(prisma.inboundMessage.count({ where: { businessId: first.id } })).resolves.toBe(1);
    await expect(prisma.inboundMessage.count({ where: { businessId: second.id } })).resolves.toBe(1);
    await expect(prisma.inboundMessage.findFirstOrThrow({ where: { businessId: second.id } })).resolves.toMatchObject({ payload: { text: 'B' } });
  });

  it('aplica statuses monotónicos, conserva timestamp y no degrada READ', async () => {
    const owner = await business('Delivery', 'phone-delivery');
    const outbound = await prisma.outboundMessage.create({ data: { businessId: owner.id, integrationEventId: crypto.randomUUID(), channel: 'WHATSAPP', recipient: '+595981234567', messageType: 'MANUAL_REPLY', payload: { text: 'Hola' }, providerMessageId: 'wamid-outbound' } });
    const sentAt = '1791028800';

    await handler().execute(parser.parse(statusPayload('phone-delivery', 'wamid-outbound', 'sent', sentAt)));
    await handler().execute(parser.parse(statusPayload('phone-delivery', 'wamid-outbound', 'delivered', '1791028801')));
    await handler().execute(parser.parse(statusPayload('phone-delivery', 'wamid-outbound', 'read', '1791028802')));
    await handler().execute(parser.parse(statusPayload('phone-delivery', 'wamid-outbound', 'delivered', '1791028801')));
    await handler().execute(parser.parse(statusPayload('phone-delivery', 'wamid-outbound', 'sent', sentAt)));

    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: outbound.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.READ, providerStatusAt: new Date('2026-10-03T12:00:02.000Z') });
  });

  it('permite FAILED antes de delivery y no degrada un delivery posterior', async () => {
    const owner = await business('Failure', 'phone-failure');
    const outbound = await prisma.outboundMessage.create({ data: { businessId: owner.id, integrationEventId: crypto.randomUUID(), channel: 'WHATSAPP', recipient: '+595981234567', messageType: 'MANUAL_REPLY', payload: { text: 'Hola' }, providerMessageId: 'wamid-failed' } });

    await handler().execute(parser.parse(statusPayload('phone-failure', 'wamid-failed', 'sent', '1791028800')));
    await handler().execute(parser.parse(statusPayload('phone-failure', 'wamid-failed', 'failed', '1791028801', [{ code: 131026, title: 'Undeliverable', message: 'No entregable' }])));
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: outbound.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.FAILED, lastError: '131026: Undeliverable: No entregable' });
    await handler().execute(parser.parse(statusPayload('phone-failure', 'wamid-failed', 'delivered', '1791028802')));
    await handler().execute(parser.parse(statusPayload('phone-failure', 'wamid-failed', 'failed', '1791028803', [{ code: 1, title: 'Late failure' }])));

    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: outbound.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.DELIVERED, lastError: null });
  });

  it('ignora statuses de otro tenant o de OutboundMessage inexistente', async () => {
    const owner = await business('Known', 'phone-known');
    const other = await business('Other', 'phone-other');
    const outbound = await prisma.outboundMessage.create({ data: { businessId: other.id, integrationEventId: crypto.randomUUID(), channel: 'WHATSAPP', recipient: '+595981234567', messageType: 'MANUAL_REPLY', payload: { text: 'Hola' }, providerMessageId: 'wamid-foreign' } });

    await handler().execute(parser.parse(statusPayload('phone-known', 'wamid-unknown', 'delivered', '1791028800')));
    await handler().execute(parser.parse(statusPayload('phone-known', 'wamid-foreign', 'delivered', '1791028800')));

    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: outbound.id } })).resolves.toMatchObject({ status: OutboundMessageStatus.PENDING });
  });
});

function inboundPayload(phoneNumberId: string, id: string, from: string, text: string): unknown {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, messages: [{ id, from, timestamp: '1791028800', type: 'text', text: { body: text } }] } }] }] };
}

function statusPayload(phoneNumberId: string, id: string, status: string, timestamp: string, errors?: unknown[]): unknown {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id, status, timestamp, ...(errors ? { errors } : {}) }] } }] }] };
}
