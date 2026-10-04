import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { Conversation } from '../domain/conversation.entity';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessage } from '../domain/outbound-message.entity';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';
import type { ConversationRepository } from '../domain/conversation.repository';
import type { OutboundMessageRepository } from '../domain/outbound-message.repository';
import type { MessagingProvider } from './messaging-provider';
import { SendManualConversationMessageUseCase } from './messaging-inbox.use-cases';
import { SendOutboundMessageUseCase } from './send-outbound-message.use-case';
import { ConversationClosedError, ManualConversationMessageNotAllowedError } from './receive-inbound-message.errors';

const businessId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const messagingConnectionId = '55555555-5555-4555-8555-555555555555';

function conversation(mode = ConversationMode.HUMAN, status = ConversationStatus.ACTIVE): Conversation { return Conversation.create({ id: conversationId, businessId, channel: MessagingChannel.WHATSAPP, messagingConnectionId, externalParticipant: '+595981234567', contactId: null, mode, status, createdAt: new Date('2026-10-11T10:00:00.000Z'), lastMessageAt: new Date('2026-10-11T10:00:00.000Z'), closedAt: status === ConversationStatus.CLOSED ? new Date() : null }); }
function message(id = '33333333-3333-4333-8333-333333333333', status = OutboundMessageStatus.PENDING): OutboundMessage { return OutboundMessage.create({ id, businessId, integrationEventId: '44444444-4444-4444-8444-444444444444', conversationId, manualClientRequestId: 'request-1', channel: MessagingChannel.WHATSAPP, recipient: '+595981234567', messageType: OutboundMessageType.MANUAL_REPLY, status, payload: { text: 'Respuesta manual' }, providerMessageId: status === OutboundMessageStatus.SENT ? 'provider-1' : null, createdAt: new Date('2026-10-11T10:01:00.000Z'), sentAt: null, failedAt: null, lastError: null }); }

describe('SendManualConversationMessageUseCase', () => {
  function setup(current = conversation()) {
    const created = message();
    const createPending = jest.fn((data) => { repository.created = data; return Promise.resolve(created); });
    const findMessage = jest.fn(() => Promise.resolve(created));
    const markSent = jest.fn(() => Promise.resolve(message(created.id, OutboundMessageStatus.SENT)));
    const markFailed = jest.fn(() => Promise.resolve(message(created.id, OutboundMessageStatus.FAILED)));
    const repository: OutboundMessageRepository & { created?: unknown } = { createPending, findByIdAndBusinessId: findMessage, findByBusinessAndProviderMessageId: jest.fn(), markSent, markFailed, applyDeliveryStatus: jest.fn() };
    const findConversation = jest.fn(() => Promise.resolve(current));
    const conversations: ConversationRepository = { findByIdAndBusinessId: findConversation, findActiveByParticipant: jest.fn(), setMode: jest.fn() };
    const providerSend = jest.fn(() => Promise.resolve({ providerMessageId: 'provider-1' }));
    const provider: MessagingProvider = { send: providerSend };
    const send = new SendOutboundMessageUseCase(repository, provider);
    return { useCase: new SendManualConversationMessageUseCase(conversations, repository, send), repository, provider, createPending, providerSend };
  }

  it('crea MANUAL_REPLY usando recipient de la conversación y lo envía', async () => {
    const fixture = setup();
    await expect(fixture.useCase.execute({ businessId, conversationId, text: '  Hola operador  ', clientRequestId: 'client-1' })).resolves.toMatchObject({ id: '33333333-3333-4333-8333-333333333333' });
    expect(fixture.repository.created).toMatchObject({ businessId, conversationId, recipient: '+595981234567', messageType: OutboundMessageType.MANUAL_REPLY, manualClientRequestId: 'client-1', payload: { text: 'Hola operador' } });
    expect(fixture.providerSend).toHaveBeenCalledTimes(1);
  });

  it('rechaza BOT y CLOSED sin crear mensaje', async () => {
    const bot = setup(conversation(ConversationMode.BOT));
    await expect(bot.useCase.execute({ businessId, conversationId, text: 'No', clientRequestId: 'bot-1' })).rejects.toBeInstanceOf(ManualConversationMessageNotAllowedError);
    expect(bot.createPending).not.toHaveBeenCalled();
    const closed = setup(conversation(ConversationMode.HUMAN, ConversationStatus.CLOSED));
    await expect(closed.useCase.execute({ businessId, conversationId, text: 'No', clientRequestId: 'closed-1' })).rejects.toBeInstanceOf(ConversationClosedError);
  });

  it('rechaza de forma controlada una Conversation legacy sin conexión', async () => {
    const legacy = Conversation.create({ id: conversationId, businessId, channel: MessagingChannel.WHATSAPP, externalParticipant: '+595981234567', contactId: null, mode: ConversationMode.HUMAN, status: ConversationStatus.ACTIVE, createdAt: new Date(), lastMessageAt: new Date(), closedAt: null });
    const fixture = setup(legacy);

    await expect(fixture.useCase.execute({ businessId, conversationId, text: 'Respuesta', clientRequestId: 'legacy-1' })).rejects.toThrow('no tiene una conexión');
    expect(fixture.createPending).not.toHaveBeenCalled();
    expect(fixture.providerSend).not.toHaveBeenCalled();
  });

  it('valida texto y clientRequestId', async () => {
    const fixture = setup();
    await expect(fixture.useCase.execute({ businessId, conversationId, text: ' ', clientRequestId: 'x' })).rejects.toThrow();
    await expect(fixture.useCase.execute({ businessId, conversationId, text: 'ok', clientRequestId: '' })).rejects.toThrow();
  });
});
