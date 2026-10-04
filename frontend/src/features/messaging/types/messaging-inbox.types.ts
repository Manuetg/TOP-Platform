export type ConversationMode = "BOT" | "HUMAN";
export type ConversationStatus = "ACTIVE" | "CLOSED";
export type ConversationDirection = "INBOUND" | "OUTBOUND";
export type OutboundMessageStatus = "PENDING" | "SENT" | "FAILED";

export interface InboxPageInfo {
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface InboxPage<T> {
  items: T[];
  pageInfo: InboxPageInfo;
}

export interface ConversationInboxSummary {
  conversationId: string;
  channel: "WHATSAPP";
  mode: ConversationMode;
  status: ConversationStatus;
  externalParticipant: string;
  contactId: string | null;
  contactName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: ConversationDirection | null;
}

export interface ConversationInboxDetail extends ConversationInboxSummary {
  createdAt: string;
  closedAt: string | null;
  contact: {
    id: string;
    name: string;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  booking: {
    id: string;
    status: string;
  } | null;
}

export interface ConversationInboxMessage {
  id: string;
  direction: ConversationDirection;
  messageType: string;
  text: string | null;
  occurredAt: string;
  status: OutboundMessageStatus | null;
  origin: "BOT" | "AUTOMATION" | "MANUAL" | null;
}

export interface ManualMessageResponse {
  id: string;
  text: string;
  status: OutboundMessageStatus;
  occurredAt: string;
}
