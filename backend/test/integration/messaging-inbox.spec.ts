import { PrismaClient } from '@prisma/client';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaContactRepository } from '../../src/modules/contact/infrastructure/prisma-contact.repository';
import { ConversationMode } from '../../src/modules/messaging/domain/conversation-mode.enum';
import { ConversationStatus } from '../../src/modules/messaging/domain/conversation-status.enum';
import { MessagingChannel } from '../../src/modules/messaging/domain/messaging-channel.enum';
import { OutboundMessageType } from '../../src/modules/messaging/domain/outbound-message-type.enum';
import { PrismaConversationInboxReader } from '../../src/modules/messaging/infrastructure/prisma-conversation-inbox.reader';
import { PrismaConversationRepository } from '../../src/modules/messaging/infrastructure/prisma-conversation.repository';
import { PrismaOutboundMessageRepository } from '../../src/modules/messaging/infrastructure/prisma-outbound-message.repository';
import { MessagingInboxUseCases, SendManualConversationMessageUseCase } from '../../src/modules/messaging/application/messaging-inbox.use-cases';
import { SendOutboundMessageUseCase } from '../../src/modules/messaging/application/send-outbound-message.use-case';
import { cleanTestDatabase } from './support/clean-test-database';
import { FakeMessagingProvider } from './support/fake-messaging.provider';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('Messaging Inbox', () => {
  const prisma = new PrismaClient();
  const contacts = new PrismaContactRepository(prisma);
  const conversations = new PrismaConversationRepository(prisma);
  const messages = new PrismaOutboundMessageRepository(prisma);
  const reader = new PrismaConversationInboxReader(prisma);
  const bookings = new PrismaBookingRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });

  async function business(name = 'Inbox Business') { return prisma.business.create({ data: { name: `${name} ${crypto.randomUUID()}` } }); }
  async function conversation(businessId: string, values: { participant?: string; mode?: ConversationMode; status?: ConversationStatus; lastMessageAt?: Date; contactId?: string | null } = {}) {
    return prisma.conversation.create({ data: { businessId, channel: MessagingChannel.WHATSAPP, externalParticipant: values.participant ?? '+595981234567', mode: values.mode ?? ConversationMode.HUMAN, status: values.status ?? ConversationStatus.ACTIVE, contactId: values.contactId ?? null, lastMessageAt: values.lastMessageAt ?? new Date('2026-10-11T12:00:00.000Z') } });
  }
  async function inbound(businessId: string, conversationId: string, id: string, at: Date, text: string) { return prisma.inboundMessage.create({ data: { businessId, conversationId, channel: MessagingChannel.WHATSAPP, providerMessageId: `wamid-${id}`, sender: '+595981234567', messageType: 'TEXT', payload: { text }, receivedAt: at } }); }
  function useCases() { return new MessagingInboxUseCases(reader, contacts, contacts, bookings); }

  it('lista solo el tenant solicitado, ordena por lastMessageAt y pagina con cursor estable', async () => {
    const owner = await business('Owner'); const other = await business('Other');
    const old = await conversation(owner.id, { lastMessageAt: new Date('2026-10-11T10:00:00.000Z') }); const recent = await conversation(owner.id, { lastMessageAt: new Date('2026-10-11T11:00:00.000Z') });
    await conversation(other.id, { lastMessageAt: new Date('2026-10-11T12:00:00.000Z') });
    const inbox = useCases();
    const first = await inbox.listConversations({ businessId: owner.id, limit: 1 });
    expect(first.items.map((item) => item.conversationId)).toEqual([recent.id]); expect(first.pageInfo.hasNextPage).toBe(true);
    const second = await inbox.listConversations({ businessId: owner.id, cursor: first.pageInfo.nextCursor!, limit: 1 });
    expect(second.items.map((item) => item.conversationId)).toEqual([old.id]); expect(second.items[0].externalParticipant).toBe('+595981234567');
  });

  it('expone detalle y contacto del mismo tenant, y no revela detalle cruzado', async () => {
    const owner = await business('Owner'); const other = await business('Other'); const contact = await prisma.contact.create({ data: { businessId: owner.id, name: 'Huésped', lastName: 'TOP', phone: '+595980000001', whatsapp: '+595980000002' } });
    const own = await conversation(owner.id, { contactId: contact.id }); const foreign = await conversation(other.id);
    const inbox = useCases();
    await expect(inbox.getConversation({ businessId: owner.id, conversationId: own.id })).resolves.toMatchObject({ contact: { id: contact.id, name: 'Huésped TOP', whatsapp: '+595980000002' } });
    await expect(inbox.getConversation({ businessId: owner.id, conversationId: foreign.id })).rejects.toThrow('La conversación no existe.');
  });

  it('une inbound y outbound en orden ascendente y mantiene el cursor', async () => {
    const owner = await business(); const current = await conversation(owner.id); await inbound(owner.id, current.id, 'one', new Date('2026-10-01T12:00:00.000Z'), 'Hola');
    await messages.createPending({ businessId: owner.id, integrationEventId: crypto.randomUUID(), conversationId: current.id, channel: MessagingChannel.WHATSAPP, recipient: current.externalParticipant, messageType: OutboundMessageType.CONVERSATION_REPLY, payload: { text: 'Respuesta' } });
    const inbox = useCases(); const page = await inbox.listMessages({ businessId: owner.id, conversationId: current.id, limit: 50 });
    expect(page.items.map((item) => [item.direction, item.text])).toEqual([['INBOUND', 'Hola'], ['OUTBOUND', 'Respuesta']]); expect(page.items[0].status).toBeNull(); expect(page.items[1].origin).toBe('BOT');
  });

  it('crea respuesta manual, usa la identidad externa persistida e idempotencia concurrente', async () => {
    const owner = await business(); const current = await conversation(owner.id, { mode: ConversationMode.HUMAN }); const provider = new FakeMessagingProvider();
    const sender = new SendManualConversationMessageUseCase(conversations, messages, new SendOutboundMessageUseCase(messages, provider));
    const results = await Promise.all([sender.execute({ businessId: owner.id, conversationId: current.id, text: 'Respuesta', clientRequestId: 'operator-1' }), sender.execute({ businessId: owner.id, conversationId: current.id, text: 'Respuesta', clientRequestId: 'operator-1' })]);
    expect(results[0].id).toBe(results[1].id); expect(provider.sent[0].recipient).toBe(current.externalParticipant); expect(await prisma.outboundMessage.count({ where: { businessId: owner.id, conversationId: current.id } })).toBe(1);
  });

  it('rechaza envío manual en BOT y CLOSED, pero CLOSED sigue siendo legible', async () => {
    const owner = await business(); const bot = await conversation(owner.id, { mode: ConversationMode.BOT }); const closed = await conversation(owner.id, { status: ConversationStatus.CLOSED, mode: ConversationMode.HUMAN }); const provider = new FakeMessagingProvider(); const sender = new SendManualConversationMessageUseCase(conversations, messages, new SendOutboundMessageUseCase(messages, provider));
    await expect(sender.execute({ businessId: owner.id, conversationId: bot.id, text: 'No', clientRequestId: 'bot' })).rejects.toThrow(); await expect(sender.execute({ businessId: owner.id, conversationId: closed.id, text: 'No', clientRequestId: 'closed' })).rejects.toThrow(); await expect(reader.findByIdAndBusinessId(closed.id, owner.id)).resolves.toMatchObject({ status: ConversationStatus.CLOSED });
  });
});
