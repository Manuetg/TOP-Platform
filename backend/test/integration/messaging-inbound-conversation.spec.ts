import { PrismaClient } from '@prisma/client';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { ChangeConversationModeUseCase } from '../../src/modules/messaging/application/change-conversation-mode.use-case';
import { ReceiveInboundMessageUseCase } from '../../src/modules/messaging/application/receive-inbound-message.use-case';
import { ConversationMode } from '../../src/modules/messaging/domain/conversation-mode.enum';
import { PrismaConversationRepository } from '../../src/modules/messaging/infrastructure/prisma-conversation.repository';
import { PrismaInboundMessageRepository } from '../../src/modules/messaging/infrastructure/prisma-inbound-message.repository';
import { PrismaReceiveInboundMessageTransaction } from '../../src/modules/messaging/infrastructure/prisma-receive-inbound-message.transaction';
import { PrismaIntegrationEventOutbox } from '../../src/shared/infrastructure/prisma-integration-event.outbox';
import type { IntegrationEventOutbox } from '../../src/shared/integration-events/integration-event.outbox';
import { cleanTestDatabase } from './support/clean-test-database';
import { FakeInboundAdapter } from './support/fake-inbound.adapter';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Messaging inbound conversations', () => {
  const prisma = new PrismaClient();
  const contacts = new PrismaContactRepository(prisma);
  const conversations = new PrismaConversationRepository(prisma);
  const inboundMessages = new PrismaInboundMessageRepository(prisma);
  const outbox = new PrismaIntegrationEventOutbox();
  const connectionByBusiness = new Map<string, string>();

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function business(name = 'Inbound Business') {
    const value = await prisma.business.create({ data: { name: `${name} ${crypto.randomUUID()}` } });
    const connection = await prisma.messagingConnection.create({ data: { businessId: value.id, channel: 'WHATSAPP', provider: 'META_WHATSAPP', providerPhoneNumberId: crypto.randomUUID().replaceAll('-', '') } });
    connectionByBusiness.set(value.id, connection.id);
    return value;
  }

  function adapter(outboxAdapter: IntegrationEventOutbox = outbox): FakeInboundAdapter {
    const transaction = new PrismaReceiveInboundMessageTransaction(prisma, outboxAdapter);
    return new FakeInboundAdapter(new ReceiveInboundMessageUseCase(contacts, transaction));
  }

  function input(businessId: string, providerMessageId: string, sender = '+595981234567', text = 'Hola', receivedAt = new Date('2026-10-03T12:00:00.000Z'), messagingConnectionId = connectionByBusiness.get(businessId)) {
    return { businessId, messagingConnectionId, channel: 'WHATSAPP' as const, providerMessageId, sender, messageType: 'TEXT' as const, payload: { text }, receivedAt };
  }

  it('primer mensaje crea Conversation ACTIVE', async () => {
    const owner = await business();
    const result = await adapter().receive(input(owner.id, 'wamid-1'));

    expect(result).toMatchObject({ deduplicated: false, conversation: { businessId: owner.id, messagingConnectionId: connectionByBusiness.get(owner.id), status: 'ACTIVE', mode: 'BOT', externalParticipant: '+595981234567' }, message: { businessId: owner.id, conversationId: result.conversation.id } });
  });

  it('segundo mensaje del mismo sender reutiliza Conversation', async () => {
    const owner = await business();
    const first = await adapter().receive(input(owner.id, 'wamid-1'));
    const second = await adapter().receive(input(owner.id, 'wamid-2', '+595981234567', 'Segundo', new Date('2026-10-03T12:01:00.000Z')));

    expect(second.conversation.id).toBe(first.conversation.id);
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.inboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(2);
  });

  it('Conversation CLOSED provoca una nueva Conversation', async () => {
    const owner = await business();
    const first = await adapter().receive(input(owner.id, 'wamid-1'));
    await prisma.conversation.update({ where: { id: first.conversation.id }, data: { status: 'CLOSED', closedAt: new Date('2026-10-03T12:01:00.000Z') } });

    const second = await adapter().receive(input(owner.id, 'wamid-2', '+595981234567', 'Nueva conversación', new Date('2026-10-03T12:02:00.000Z')));

    expect(second.conversation.id).not.toBe(first.conversation.id);
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(2);
  });

  it('mismo providerMessageId no duplica InboundMessage ni evento', async () => {
    const owner = await business();
    const first = await adapter().receive(input(owner.id, 'wamid-duplicate'));
    const duplicate = await adapter().receive(input(owner.id, 'wamid-duplicate', '+595981234567', 'Reentrega'));

    expect(duplicate).toMatchObject({ deduplicated: true, message: { id: first.message.id }, conversation: { id: first.conversation.id } });
    await expect(prisma.inboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: owner.id, eventType: 'MESSAGING_INBOUND_RECEIVED' } })).resolves.toBe(1);
  });

  it('conserva businessId y no reutiliza Conversation de otro Business', async () => {
    const firstBusiness = await business('First');
    const secondBusiness = await business('Second');
    const first = await adapter().receive(input(firstBusiness.id, 'wamid-first'));
    const second = await adapter().receive(input(secondBusiness.id, 'wamid-second'));

    expect(first.conversation.businessId).toBe(firstBusiness.id);
    expect(second.conversation.businessId).toBe(secondBusiness.id);
    expect(second.conversation.id).not.toBe(first.conversation.id);
  });

  it('no permite leer InboundMessage de otro Business', async () => {
    const firstBusiness = await business('Reader First');
    const secondBusiness = await business('Reader Second');
    const second = await adapter().receive(input(secondBusiness.id, 'wamid-private'));

    await expect(inboundMessages.findByIdAndBusinessId(second.message.id, firstBusiness.id)).resolves.toBeNull();
    await expect(inboundMessages.listByConversationAndBusinessId(second.conversation.id, firstBusiness.id)).resolves.toEqual([]);
  });

  it('vincula Contact del mismo Business', async () => {
    const owner = await business();
    const contact = await prisma.contact.create({ data: { businessId: owner.id, name: 'Huésped', lastName: 'TOP', whatsapp: '+595981234567', phone: null } });

    const result = await adapter().receive(input(owner.id, 'wamid-contact'));

    expect(result.conversation.contactId).toBe(contact.id);
  });

  it('no vincula Contact de otro Business', async () => {
    const contactBusiness = await business('Contact');
    const inboundBusiness = await business('Inbound');
    await prisma.contact.create({ data: { businessId: contactBusiness.id, name: 'Otro', lastName: 'Negocio', whatsapp: '+595981234567', phone: null } });

    const result = await adapter().receive(input(inboundBusiness.id, 'wamid-cross-business'));

    expect(result.conversation.contactId).toBeNull();
  });

  it('deja contactId null si no existe Contact', async () => {
    const owner = await business();
    const result = await adapter().receive(input(owner.id, 'wamid-no-contact'));

    expect(result.conversation.contactId).toBeNull();
  });

  it('inicia mode BOT', async () => {
    const owner = await business();
    const result = await adapter().receive(input(owner.id, 'wamid-mode'));

    expect(result.conversation.mode).toBe(ConversationMode.BOT);
  });

  it('permite BOT -> HUMAN -> BOT mediante application layer', async () => {
    const owner = await business();
    const result = await adapter().receive(input(owner.id, 'wamid-transition'));
    const changeMode = new ChangeConversationModeUseCase(conversations);

    await expect(changeMode.execute({ businessId: owner.id, conversationId: result.conversation.id, mode: ConversationMode.HUMAN })).resolves.toMatchObject({ mode: ConversationMode.HUMAN });
    await expect(changeMode.execute({ businessId: owner.id, conversationId: result.conversation.id, mode: ConversationMode.BOT })).resolves.toMatchObject({ mode: ConversationMode.BOT });
  });

  it('actualiza lastMessageAt sin retroceder ante mensajes fuera de orden', async () => {
    const owner = await business();
    const first = await adapter().receive(input(owner.id, 'wamid-time-1', '+595981234567', 'Primero', new Date('2026-10-03T12:05:00.000Z')));
    await adapter().receive(input(owner.id, 'wamid-time-2', '+595981234567', 'Anterior', new Date('2026-10-03T12:04:00.000Z')));
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversation.id } });

    expect(row.lastMessageAt).toEqual(new Date('2026-10-03T12:05:00.000Z'));
  });

  it('mismo sender en otra conexión del mismo Business crea otra Conversation', async () => {
    const owner = await business();
    const secondConnection = await prisma.messagingConnection.create({ data: { businessId: owner.id, channel: 'WHATSAPP', provider: 'META_WHATSAPP', providerPhoneNumberId: `second-${crypto.randomUUID()}` } });
    const first = await adapter().receive(input(owner.id, 'wamid-connection-a'));
    const second = await adapter().receive(input(owner.id, 'wamid-connection-b', '+595981234567', 'Segundo número', new Date('2026-10-03T12:01:00.000Z'), secondConnection.id));

    expect(first.conversation.id).not.toBe(second.conversation.id);
    expect(first.conversation.messagingConnectionId).not.toBe(second.conversation.messagingConnectionId);
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(2);
  });

  it('concurrencia del mismo sender y conexión crea una sola Conversation', async () => {
    const owner = await business();
    const results = await Promise.all([
      adapter().receive(input(owner.id, 'wamid-concurrent-a')),
      adapter().receive(input(owner.id, 'wamid-concurrent-b', '+595981234567', 'Segundo', new Date('2026-10-03T12:01:00.000Z'))),
    ]);

    expect(results[0].conversation.id).toBe(results[1].conversation.id);
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(1);
  });

  it('concurrencia del mismo sender en conexiones distintas crea dos Conversations correctas', async () => {
    const owner = await business();
    const secondConnection = await prisma.messagingConnection.create({ data: { businessId: owner.id, channel: 'WHATSAPP', provider: 'META_WHATSAPP', providerPhoneNumberId: `second-${crypto.randomUUID()}` } });
    const results = await Promise.all([
      adapter().receive(input(owner.id, 'wamid-concurrent-phone-a')),
      adapter().receive(input(owner.id, 'wamid-concurrent-phone-b', '+595981234567', 'Segundo número', new Date('2026-10-03T12:01:00.000Z'), secondConnection.id)),
    ]);

    expect(new Set(results.map((result) => result.conversation.id)).size).toBe(2);
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(2);
  });

  it('persiste correctamente payload TEXT', async () => {
    const owner = await business();
    const result = await adapter().receive(input(owner.id, 'wamid-payload', '+595981234567', 'Hola persistido'));
    const row = await prisma.inboundMessage.findUniqueOrThrow({ where: { id: result.message.id } });

    expect(row.payload).toEqual({ text: 'Hola persistido' });
    expect(row.messageType).toBe('TEXT');
  });

  it('guarda Conversation, InboundMessage y Outbox en la misma transacción', async () => {
    const owner = await business();
    const failingOutbox: IntegrationEventOutbox = { append: () => Promise.reject(new Error('forced outbox failure')) };

    await expect(adapter(failingOutbox).receive(input(owner.id, 'wamid-atomic'))).rejects.toThrow('forced outbox failure');
    await expect(prisma.conversation.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.inboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.integrationOutboxEvent.count({ where: { businessId: owner.id } })).resolves.toBe(0);
  });
});
