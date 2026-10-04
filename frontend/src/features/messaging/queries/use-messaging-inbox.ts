import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeMessagingConversationMode,
  getMessagingConversation,
  listMessagingConversations,
  listMessagingMessages,
  sendManualMessagingMessage,
} from "../api/messaging-inbox.api";
import type { ConversationMode } from "../types/messaging-inbox.types";

export const messagingInboxKeys = {
  all: ["messaging", "inbox"] as const,
  conversations: (businessId: string) => ["messaging", "inbox", "conversations", businessId] as const,
  conversation: (businessId: string, conversationId: string) => ["messaging", "inbox", "conversation", businessId, conversationId] as const,
  messages: (businessId: string, conversationId: string) => ["messaging", "inbox", "messages", businessId, conversationId] as const,
};

interface MessagingInboxQueryOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useMessagingConversations({ businessId, accessToken }: MessagingInboxQueryOptions) {
  return useInfiniteQuery({
    queryKey: messagingInboxKeys.conversations(businessId),
    queryFn: ({ pageParam }) => listMessagingConversations(businessId, pageParam, accessToken),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: Boolean(businessId),
    retry: false,
  });
}

export function useMessagingConversation({ businessId, conversationId, accessToken }: MessagingInboxQueryOptions & { conversationId: string }) {
  return useQuery({
    queryKey: messagingInboxKeys.conversation(businessId, conversationId),
    queryFn: () => getMessagingConversation(businessId, conversationId, accessToken),
    enabled: Boolean(businessId && conversationId),
    retry: false,
  });
}

export function useMessagingMessages({ businessId, conversationId, accessToken }: MessagingInboxQueryOptions & { conversationId: string }) {
  return useInfiniteQuery({
    queryKey: messagingInboxKeys.messages(businessId, conversationId),
    queryFn: ({ pageParam }) => listMessagingMessages(businessId, conversationId, pageParam, accessToken),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: Boolean(businessId && conversationId),
    retry: false,
  });
}

export function useChangeMessagingConversationMode({ businessId, accessToken }: MessagingInboxQueryOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, mode }: { conversationId: string; mode: ConversationMode }) =>
      changeMessagingConversationMode(businessId, conversationId, mode, accessToken),
    onSuccess: (conversation) => {
      queryClient.setQueryData(messagingInboxKeys.conversation(businessId, conversation.conversationId), conversation);
      void queryClient.invalidateQueries({ queryKey: messagingInboxKeys.conversations(businessId) });
    },
  });
}

export function useSendManualMessagingMessage({ businessId, accessToken }: MessagingInboxQueryOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, text, clientRequestId }: { conversationId: string; text: string; clientRequestId: string }) =>
      sendManualMessagingMessage(businessId, conversationId, text, clientRequestId, accessToken),
    onSuccess: (_message, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: messagingInboxKeys.conversation(businessId, variables.conversationId) }),
        queryClient.invalidateQueries({ queryKey: messagingInboxKeys.messages(businessId, variables.conversationId) }),
        queryClient.invalidateQueries({ queryKey: messagingInboxKeys.conversations(businessId) }),
      ]);
    },
  });
}
