import { Conversation } from '../domain/conversation.entity';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { ConversationRepository } from '../domain/conversation.repository';
import { ChangeConversationModeUseCase } from './change-conversation-mode.use-case';
import { ConversationNotFoundError } from './receive-inbound-message.errors';

const businessId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';

function conversation(mode: ConversationMode): Conversation {
  return Conversation.create({ id: conversationId, businessId, channel: MessagingChannel.WHATSAPP, externalParticipant: '+595981234567', contactId: null, mode, status: ConversationStatus.ACTIVE, createdAt: new Date(), lastMessageAt: new Date(), closedAt: null });
}

describe('ChangeConversationModeUseCase', () => {
  it('permite BOT -> HUMAN -> BOT', async () => {
    let current = conversation(ConversationMode.BOT);
    const setMode = (_id: string, _businessId: string, mode: ConversationMode): Promise<Conversation> => { current = conversation(mode); return Promise.resolve(current); };
    const repository: ConversationRepository = { findByIdAndBusinessId: jest.fn(), findActiveByParticipant: jest.fn(), setMode };
    const useCase = new ChangeConversationModeUseCase(repository);

    await expect(useCase.execute({ businessId, conversationId, mode: ConversationMode.HUMAN })).resolves.toMatchObject({ mode: ConversationMode.HUMAN });
    await expect(useCase.execute({ businessId, conversationId, mode: ConversationMode.BOT })).resolves.toMatchObject({ mode: ConversationMode.BOT });
  });

  it('rechaza una conversación de otro tenant o inexistente', async () => {
    const repository: ConversationRepository = { findByIdAndBusinessId: jest.fn(), findActiveByParticipant: jest.fn(), setMode: jest.fn().mockResolvedValue(null) };
    const useCase = new ChangeConversationModeUseCase(repository);

    await expect(useCase.execute({ businessId, conversationId, mode: ConversationMode.HUMAN })).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});
