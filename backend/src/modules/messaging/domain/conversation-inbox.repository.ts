import { ConversationMode } from './conversation-mode.enum';
import { ConversationStatus } from './conversation-status.enum';
import { MessagingChannel } from './messaging-channel.enum';
import { OutboundMessageStatus } from './outbound-message-status.enum';

export type InboxCursor = { occurredAt: Date; id: string };

export interface ConversationInboxSummary {
  conversationId: string;
  businessId: string;
  channel: MessagingChannel;
  mode: ConversationMode;
  status: ConversationStatus;
  externalParticipant: string;
  contactId: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageDirection: 'INBOUND' | 'OUTBOUND' | null;
}

export interface ConversationInboxDetail extends ConversationInboxSummary {
  createdAt: Date;
  closedAt: Date | null;
  bookingId: string | null;
}

export interface ConversationInboxMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  text: string | null;
  occurredAt: Date;
  status: OutboundMessageStatus | null;
  origin: 'BOT' | 'AUTOMATION' | 'MANUAL' | null;
}

export const CONVERSATION_INBOX_READER = Symbol('CONVERSATION_INBOX_READER');
export interface ConversationInboxReader {
  list(input: { businessId: string; before: InboxCursor | null; limit: number }): Promise<ConversationInboxSummary[]>;
  findByIdAndBusinessId(id: string, businessId: string): Promise<ConversationInboxDetail | null>;
  listMessages(input: { conversationId: string; businessId: string; after: InboxCursor | null; limit: number }): Promise<ConversationInboxMessage[]>;
}
