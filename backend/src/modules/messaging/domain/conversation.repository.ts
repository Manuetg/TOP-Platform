import { Conversation } from './conversation.entity';
import { ConversationMode } from './conversation-mode.enum';
import { MessagingChannel } from './messaging-channel.enum';

export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

export interface ConversationRepository {
  findByIdAndBusinessId(id: string, businessId: string): Promise<Conversation | null>;
  setMode(id: string, businessId: string, mode: ConversationMode): Promise<Conversation | null>;
  findActiveByParticipant(businessId: string, channel: MessagingChannel, externalParticipant: string): Promise<Conversation | null>;
}
