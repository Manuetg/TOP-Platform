import { apiRequest } from "../../../shared/api/api-client";
import type {
  ConversationInboxDetail,
  ConversationInboxMessage,
  ConversationInboxSummary,
  ConversationMode,
  InboxPage,
  ManualMessageResponse,
} from "../types/messaging-inbox.types";

function basePath(businessId: string): string {
  return `/businesses/${businessId}/messaging/conversations`;
}

function withCursor(path: string, cursor?: string | null): string {
  return cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;
}

export function listMessagingConversations(
  businessId: string,
  cursor?: string | null,
  accessToken?: string | null,
): Promise<InboxPage<ConversationInboxSummary>> {
  return apiRequest<InboxPage<ConversationInboxSummary>>(
    withCursor(basePath(businessId), cursor),
    { accessToken },
  );
}

export function getMessagingConversation(
  businessId: string,
  conversationId: string,
  accessToken?: string | null,
): Promise<ConversationInboxDetail> {
  return apiRequest<ConversationInboxDetail>(
    `${basePath(businessId)}/${conversationId}`,
    { accessToken },
  );
}

export function listMessagingMessages(
  businessId: string,
  conversationId: string,
  cursor?: string | null,
  accessToken?: string | null,
): Promise<InboxPage<ConversationInboxMessage>> {
  return apiRequest<InboxPage<ConversationInboxMessage>>(
    withCursor(`${basePath(businessId)}/${conversationId}/messages`, cursor),
    { accessToken },
  );
}

export function changeMessagingConversationMode(
  businessId: string,
  conversationId: string,
  mode: ConversationMode,
  accessToken?: string | null,
): Promise<ConversationInboxDetail> {
  return apiRequest<ConversationInboxDetail>(
    `${basePath(businessId)}/${conversationId}/mode`,
    { method: "PATCH", body: JSON.stringify({ mode }), accessToken },
  );
}

export function sendManualMessagingMessage(
  businessId: string,
  conversationId: string,
  text: string,
  clientRequestId: string,
  accessToken?: string | null,
): Promise<ManualMessageResponse> {
  return apiRequest<ManualMessageResponse>(
    `${basePath(businessId)}/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ text, clientRequestId }),
      accessToken,
    },
  );
}
