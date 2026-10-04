import { MessagingChannel } from './messaging-channel.enum';
import { OutboundMessage } from './outbound-message.entity';
import { OutboundMessageType } from './outbound-message-type.enum';

export const OUTBOUND_MESSAGE_REPOSITORY = Symbol('OUTBOUND_MESSAGE_REPOSITORY');
export const TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY = Symbol('TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY');

export interface CreateOutboundMessageData {
  businessId: string;
  integrationEventId: string;
  channel: MessagingChannel;
  recipient: string;
  messageType: OutboundMessageType;
  payload: OutboundMessage['payload'];
}

export interface OutboundMessageRepository {
  createPending(data: CreateOutboundMessageData): Promise<OutboundMessage>;
  findByIdAndBusinessId(id: string, businessId: string): Promise<OutboundMessage | null>;
  markSent(id: string, businessId: string, providerMessageId: string, sentAt: Date): Promise<OutboundMessage | null>;
  markFailed(id: string, businessId: string, failedAt: Date, lastError: string): Promise<OutboundMessage | null>;
}

export interface TransactionalOutboundMessageRepository extends OutboundMessageRepository {
  createPendingInTransaction(transaction: unknown, data: CreateOutboundMessageData): Promise<OutboundMessage>;
}
