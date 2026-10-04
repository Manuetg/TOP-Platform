import { Conversation } from '../domain/conversation.entity';
import { InboundMessage, InboundMessagePayload } from '../domain/inbound-message.entity';
import { InboundMessageType } from '../domain/inbound-message-type.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';

export interface InboundMessageEnvelope {
  businessId: string;
  channel: MessagingChannel;
  providerMessageId: string;
  sender: string;
  messageType: InboundMessageType;
  payload: InboundMessagePayload;
  receivedAt: Date;
}

export interface ReceiveInboundMessageInput {
  businessId: unknown;
  channel: unknown;
  providerMessageId: unknown;
  sender: unknown;
  messageType: unknown;
  payload: unknown;
  receivedAt?: unknown;
}

export interface ReceiveInboundMessageResult {
  conversation: Conversation;
  message: InboundMessage;
  deduplicated: boolean;
}

export interface ReceiveInboundMessageTransaction {
  receive(input: { envelope: InboundMessageEnvelope; contactId: string | null }): Promise<ReceiveInboundMessageResult>;
}

export const RECEIVE_INBOUND_MESSAGE_TRANSACTION = Symbol('RECEIVE_INBOUND_MESSAGE_TRANSACTION');
