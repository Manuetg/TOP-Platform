import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { ChangeConversationModeUseCase } from '../../src/modules/messaging/application/change-conversation-mode.use-case';
import { ConversationBotConsumer } from '../../src/modules/messaging/application/conversation-bot.consumer';
import { PrismaConversationBotTransaction } from '../../src/modules/messaging/infrastructure/prisma-conversation-bot.transaction';
import { ReceiveInboundMessageUseCase } from '../../src/modules/messaging/application/receive-inbound-message.use-case';
import { SendOutboundMessageUseCase } from '../../src/modules/messaging/application/send-outbound-message.use-case';
import { ConversationMode } from '../../src/modules/messaging/domain/conversation-mode.enum';
import { PrismaConversationRepository } from '../../src/modules/messaging/infrastructure/prisma-conversation.repository';
import { PrismaOutboundMessageRepository } from '../../src/modules/messaging/infrastructure/prisma-outbound-message.repository';
import { PrismaReceiveInboundMessageTransaction } from '../../src/modules/messaging/infrastructure/prisma-receive-inbound-message.transaction';
import { IntegrationEventConsumerRegistry } from '../../src/shared/integration-events/integration-event-consumer-registry';
import { IntegrationEventDispatcher } from '../../src/shared/integration-events/integration-event-dispatcher';
import type { IntegrationEvent } from '../../src/shared/integration-events/integration-event';
import { PrismaIntegrationEventOutbox } from '../../src/shared/infrastructure/prisma-integration-event.outbox';
import { PrismaIntegrationOutboxRepository } from '../../src/shared/infrastructure/prisma-integration-outbox.repository';
import { cleanTestDatabase } from './support/clean-test-database';
import { FakeMessagingProvider } from './support/fake-messaging.provider';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Messaging conversation bot', () => {
  const prisma = new PrismaClient();
  const outbox = new PrismaIntegrationOutboxRepository(prisma);
  const integrationEventOutbox = new PrismaIntegrationEventOutbox();
  const contacts = { findByMessagingAddressAndBusinessId: jest.fn().mockResolvedValue(null) };
  const conversations = new PrismaConversationRepository(prisma);
  const businesses = new PrismaBusinessRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function business(name = 'Bot Business') {
    return prisma.business.create({ data: { name: `${name} ${randomUUID()}` } });
  }

  function input(businessId: string, providerMessageId: string, text = 'Hola', sender = '+595981234567') {
    return { businessId, channel: 'WHATSAPP' as const, providerMessageId, sender, messageType: 'TEXT' as const, payload: { text }, receivedAt: new Date('2026-10-03T12:00:00.000Z') };
  }

  function bot() {
    const registry = new IntegrationEventConsumerRegistry();
    const transaction = new PrismaConversationBotTransaction(prisma, new PrismaOutboundMessageRepository(prisma));
    const consumer = new ConversationBotConsumer(businesses, transaction, registry);
    const dispatcher = new IntegrationEventDispatcher(outbox, [consumer], { baseBackoffMs: 0 });
    return { consumer, dispatcher };
  }

  async function receive(businessId: string, providerMessageId: string, text = 'Hola', sender = '+595981234567') {
    const receiver = new ReceiveInboundMessageUseCase(contacts, new PrismaReceiveInboundMessageTransaction(prisma, integrationEventOutbox));
    const result = await receiver.execute(input(businessId, providerMessageId, text, sender));
    const event = (await prisma.integrationOutboxEvent.findMany({ where: { businessId, eventType: 'MESSAGING_INBOUND_RECEIVED', aggregateId: result.conversation.id }, orderBy: [{ createdAt: 'asc' }, { eventId: 'asc' }] })).find((candidate) => (candidate.payload as { inboundMessageId?: string }).inboundMessageId === result.message.id);
    if (!event) throw new Error('No se encontró el evento de integración del mensaje entrante.');
    return { result, event };
  }

  async function eventAsContract(eventId: string): Promise<IntegrationEvent> {
    const event = await prisma.integrationOutboxEvent.findUniqueOrThrow({ where: { eventId } });
    return { eventId: event.eventId, eventType: event.eventType, payloadVersion: event.payloadVersion, businessId: event.businessId, aggregateType: event.aggregateType, aggregateId: event.aggregateId, occurredAt: event.occurredAt, correlationId: event.correlationId, payload: event.payload as IntegrationEvent['payload'] };
  }

  it('crea sesión START, responde bienvenida y deja OutboundMessage PENDING', async () => {
    const owner = await business('Cabañas TOP');
    const { result } = await receive(owner.id, 'wamid-bot-1');
    const { dispatcher } = bot();

    await expect(dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    await expect(prisma.conversationSession.findUniqueOrThrow({ where: { conversationId_businessId: { conversationId: result.conversation.id, businessId: owner.id } } })).resolves.toMatchObject({ businessId: owner.id, state: 'MAIN_MENU' });
    await expect(prisma.outboundMessage.findMany({ where: { businessId: owner.id } })).resolves.toEqual([expect.objectContaining({ status: 'PENDING', messageType: 'CONVERSATION_REPLY', payload: expect.objectContaining({ text: expect.stringContaining(owner.name) }) })]);
  });

  it('no repite la bienvenida en el segundo mensaje y conserva la sesión', async () => {
    const owner = await business();
    const first = await receive(owner.id, 'wamid-bot-2a');
    const worker = bot().dispatcher;
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');
    await receive(owner.id, 'wamid-bot-2b', 'Hola otra vez');
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');

    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect(messages).toHaveLength(2);
    expect((messages[0].payload as { text: string }).text).toContain('Bienvenido');
    expect((messages[1].payload as { text: string }).text).not.toContain('Bienvenido');
    await expect(prisma.conversationSession.findUniqueOrThrow({ where: { conversationId_businessId: { conversationId: first.result.conversation.id, businessId: owner.id } } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it.each([
    ['1', 'disponibilidad'],
    ['2', 'creación de reservas'],
    ['3', 'consulta de reservas'],
  ])('responde de forma controlada a la opción %s', async (option, response) => {
    const owner = await business();
    const worker = bot().dispatcher;
    await receive(owner.id, `wamid-option-${option}-a`);
    await worker.dispatchOnce();
    await receive(owner.id, `wamid-option-${option}-b`, option);
    await worker.dispatchOnce();

    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect((messages[1].payload as { text: string }).text).toContain(response);
    await expect(prisma.conversation.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ mode: 'BOT' });
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it('opción 4 transfiere a HUMAN y envía el cierre del bot', async () => {
    const owner = await business();
    const worker = bot().dispatcher;
    await receive(owner.id, 'wamid-handoff-a');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-handoff-b', '4');
    await worker.dispatchOnce();

    await expect(prisma.conversation.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ mode: 'HUMAN' });
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'HUMAN_HANDOFF' });
    await expect(prisma.outboundMessage.findMany({ where: { businessId: owner.id } })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ payload: { text: 'Te estamos comunicando con una persona.' } })]));
  });

  it('no responde nuevos mensajes mientras la conversación está en HUMAN', async () => {
    const owner = await business();
    const worker = bot().dispatcher;
    await receive(owner.id, 'wamid-human-a');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-human-b', '4');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-human-c', '1');
    await expect(worker.dispatchOnce()).resolves.toBe('PROCESSED');

    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(2);
  });

  it('al volver de HUMAN a BOT conserva el menú', async () => {
    const owner = await business();
    const worker = bot().dispatcher;
    const first = await receive(owner.id, 'wamid-return-a');
    await worker.dispatchOnce();
    await receive(owner.id, 'wamid-return-b', '4');
    await worker.dispatchOnce();
    const changeMode = new ChangeConversationModeUseCase(conversations);
    await changeMode.execute({ businessId: owner.id, conversationId: first.result.conversation.id, mode: ConversationMode.BOT });
    await receive(owner.id, 'wamid-return-c', '2');
    await worker.dispatchOnce();

    const messages = await prisma.outboundMessage.findMany({ where: { businessId: owner.id }, orderBy: { createdAt: 'asc' } });
    expect((messages[2].payload as { text: string }).text).toContain('creación de reservas');
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it('reentrega el mismo IntegrationEvent sin duplicar ni avanzar otra vez', async () => {
    const owner = await business();
    const received = await receive(owner.id, 'wamid-idempotent');
    const { consumer, dispatcher } = bot();
    await expect(dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    await consumer.handle(await eventAsContract(received.event.eventId));

    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.conversationBotEvent.count({ where: { businessId: owner.id } })).resolves.toBe(1);
    await expect(prisma.conversationSession.findFirstOrThrow({ where: { businessId: owner.id } })).resolves.toMatchObject({ state: 'MAIN_MENU' });
  });

  it('revierte sesión y marcador si falla la creación transaccional de OutboundMessage', async () => {
    const owner = await business();
    const received = await receive(owner.id, 'wamid-atomic-bot');
    const failingMessages = { createPendingInTransaction: jest.fn().mockRejectedValue(new Error('forced outbound failure')) } as never;
    const transaction = new PrismaConversationBotTransaction(prisma, failingMessages);

    await expect(transaction.process({ event: await eventAsContract(received.event.eventId), businessName: owner.name })).rejects.toThrow('forced outbound failure');
    await expect(prisma.conversationSession.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.conversationBotEvent.count({ where: { businessId: owner.id } })).resolves.toBe(0);
    await expect(prisma.outboundMessage.count({ where: { businessId: owner.id } })).resolves.toBe(0);
  });

  it('preserva businessId y nombre en respuestas de negocios distintos', async () => {
    const first = await business('Negocio A');
    const second = await business('Negocio B');
    const worker = bot().dispatcher;
    await receive(first.id, 'wamid-tenant-a');
    await receive(second.id, 'wamid-tenant-b');
    await worker.dispatchAvailable(2);

    const firstMessage = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: first.id } });
    const secondMessage = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: second.id } });
    expect(firstMessage.businessId).toBe(first.id);
    expect((firstMessage.payload as { text: string }).text).toContain(first.name);
    expect((firstMessage.payload as { text: string }).text).not.toContain(second.name);
    expect(secondMessage.businessId).toBe(second.id);
    expect((secondMessage.payload as { text: string }).text).toContain(second.name);
  });

  it('entrega el OutboundMessage PENDING al FakeMessagingProvider y luego SENT', async () => {
    const owner = await business();
    const received = await receive(owner.id, 'wamid-provider');
    await expect(bot().dispatcher.dispatchOnce()).resolves.toBe('PROCESSED');
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { businessId: owner.id, integrationEventId: received.event.eventId } });
    const provider = new FakeMessagingProvider();
    const sender = new SendOutboundMessageUseCase(new PrismaOutboundMessageRepository(prisma), provider);

    await expect(sender.execute({ id: message.id, businessId: owner.id })).resolves.toBe(`fake-provider-${message.id}`);
    await expect(prisma.outboundMessage.findUniqueOrThrow({ where: { id: message.id } })).resolves.toMatchObject({ status: 'SENT', providerMessageId: `fake-provider-${message.id}` });
    expect(provider.sent).toHaveLength(1);
  });
});
