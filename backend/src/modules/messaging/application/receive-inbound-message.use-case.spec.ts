import { ContactMessagingLookup } from '../../contact/contact.contract';
import { Contact } from '../../contact/domain/contact.entity';
import { ContactStatus } from '../../contact/domain/contact-status.enum';
import { Conversation } from '../domain/conversation.entity';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { InboundMessage } from '../domain/inbound-message.entity';
import { InboundMessageType } from '../domain/inbound-message-type.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { ReceiveInboundMessageTransaction } from './receive-inbound-message.contract';
import { InvalidInboundMessageInputError } from './receive-inbound-message.errors';
import { ReceiveInboundMessageUseCase } from './receive-inbound-message.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
const messagingConnectionId = '55555555-5555-4555-8555-555555555555';

function result() {
  const conversation = Conversation.create({ id: '33333333-3333-4333-8333-333333333333', businessId, channel: MessagingChannel.WHATSAPP, messagingConnectionId, externalParticipant: '+595981234567', contactId, mode: ConversationMode.BOT, status: ConversationStatus.ACTIVE, createdAt: new Date(), lastMessageAt: new Date(), closedAt: null });
  const message = InboundMessage.create({ id: '44444444-4444-4444-8444-444444444444', businessId, conversationId: conversation.id, channel: MessagingChannel.WHATSAPP, providerMessageId: 'wamid-1', sender: '+595981234567', messageType: InboundMessageType.TEXT, payload: { text: 'Hola' }, receivedAt: new Date(), createdAt: new Date() });
  return { conversation, message, deduplicated: false };
}

function input(overrides: Record<string, unknown> = {}) {
  return { businessId, channel: MessagingChannel.WHATSAPP, messagingConnectionId, providerMessageId: 'wamid-1', sender: '+595981234567', messageType: InboundMessageType.TEXT, payload: { text: 'Hola' }, receivedAt: new Date('2026-10-03T12:00:00.000Z'), ...overrides };
}

const invalidInputs: Array<[string, Record<string, unknown>]> = [
  ['messageType', { messageType: InboundMessageType.IMAGE }],
  ['payload', { payload: { text: '' } }],
  ['sender', { sender: '595981234567' }],
];

describe('ReceiveInboundMessageUseCase', () => {
  it('valida el envelope y pasa el contactId tenant-scoped a la transacción', async () => {
    const contact = Contact.create({ id: contactId, businessId, name: 'Huésped', lastName: null, phone: null, whatsapp: '+595981234567', email: null, documentType: null, documentNumber: null, country: null, city: null, status: ContactStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
    const findContact = jest.fn().mockResolvedValue(contact);
    const receive = jest.fn().mockResolvedValue(result());
    const contacts: ContactMessagingLookup = { findByMessagingAddressAndBusinessId: findContact };
    const transaction: ReceiveInboundMessageTransaction = { receive };
    const useCase = new ReceiveInboundMessageUseCase(contacts, transaction);

    await expect(useCase.execute(input())).resolves.toMatchObject({ conversation: { contactId }, message: { payload: { text: 'Hola' } } });
    expect(findContact).toHaveBeenCalledWith('+595981234567', businessId);
  });

  it.each(invalidInputs)('rechaza input inválido en %s', async (_field, override) => {
    const findContact = jest.fn();
    const receive = jest.fn();
    const contacts: ContactMessagingLookup = { findByMessagingAddressAndBusinessId: findContact };
    const transaction: ReceiveInboundMessageTransaction = { receive };
    const useCase = new ReceiveInboundMessageUseCase(contacts, transaction);

    await expect(useCase.execute(input(override))).rejects.toBeInstanceOf(InvalidInboundMessageInputError);
    expect(receive).not.toHaveBeenCalled();
  });
});
