import { InboundMessage } from './inbound-message.entity';

export const INBOUND_MESSAGE_REPOSITORY = Symbol('INBOUND_MESSAGE_REPOSITORY');

export interface InboundMessageRepository {
  findByIdAndBusinessId(id: string, businessId: string): Promise<InboundMessage | null>;
  listByConversationAndBusinessId(conversationId: string, businessId: string): Promise<InboundMessage[]>;
}
