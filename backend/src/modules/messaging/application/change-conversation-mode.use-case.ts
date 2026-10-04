import { Inject, Injectable } from '@nestjs/common';
import { CONVERSATION_REPOSITORY, type ConversationRepository } from '../domain/conversation.repository';
import type { Conversation } from '../domain/conversation.entity';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { ConversationClosedError, ConversationNotFoundError, InvalidInboundMessageInputError } from './receive-inbound-message.errors';

@Injectable()
export class ChangeConversationModeUseCase {
  constructor(@Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository) {}

  async execute(input: { businessId: unknown; conversationId: unknown; mode: unknown }): Promise<Conversation> {
    const businessId = uuid(input.businessId);
    const conversationId = uuid(input.conversationId);
    if (input.mode !== ConversationMode.BOT && input.mode !== ConversationMode.HUMAN) throw new InvalidInboundMessageInputError('El modo de conversación no es válido.');
    const current = await this.conversations.findByIdAndBusinessId(conversationId, businessId);
    if (!current) throw new ConversationNotFoundError('La conversación no existe.');
    if (current.status !== ConversationStatus.ACTIVE) throw new ConversationClosedError('La conversación está cerrada.');
    const conversation = await this.conversations.setMode(conversationId, businessId, input.mode);
    if (!conversation) throw new ConversationNotFoundError('La conversación no existe.');
    return conversation;
  }
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InvalidInboundMessageInputError('El identificador no es válido.');
  return value;
}
