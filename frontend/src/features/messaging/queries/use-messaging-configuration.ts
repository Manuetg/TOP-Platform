import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getMessagingSettings,
  listMessagingAutomations,
  listMessagingTemplates,
  updateMessagingAutomation,
  updateMessagingSettings,
  updateMessagingTemplate,
} from "../api/messaging.api";
import type { MessagingAutomationType } from "../types/messaging.types";

export const messagingKeys = {
  settings: (businessId: string) => ["messaging", "settings", businessId] as const,
  automations: (businessId: string) => ["messaging", "automations", businessId] as const,
  templates: (businessId: string) => ["messaging", "templates", businessId] as const,
};

interface MessagingQueryOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useMessagingSettings({ businessId, accessToken }: MessagingQueryOptions) {
  return useQuery({
    queryKey: messagingKeys.settings(businessId),
    queryFn: () => getMessagingSettings(businessId, accessToken),
    enabled: Boolean(businessId),
    retry: false,
  });
}

export function useUpdateMessagingSettings({ businessId, accessToken }: MessagingQueryOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (botEnabled: boolean) => updateMessagingSettings(businessId, botEnabled, accessToken),
    onSuccess: (settings) => queryClient.setQueryData(messagingKeys.settings(businessId), settings),
  });
}

export function useMessagingAutomations({ businessId, accessToken }: MessagingQueryOptions) {
  return useQuery({
    queryKey: messagingKeys.automations(businessId),
    queryFn: () => listMessagingAutomations(businessId, accessToken),
    enabled: Boolean(businessId),
    retry: false,
  });
}

export function useUpdateMessagingAutomation({ businessId, accessToken }: MessagingQueryOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ automationType, enabled }: { automationType: MessagingAutomationType; enabled: boolean }) =>
      updateMessagingAutomation(businessId, automationType, enabled, accessToken),
    onSuccess: (updated) => queryClient.setQueryData(messagingKeys.automations(businessId), (current: typeof updated[] | undefined) =>
      current?.map((rule) => rule.automationType === updated.automationType ? updated : rule) ?? [updated]),
  });
}

export function useMessagingTemplates({ businessId, accessToken }: MessagingQueryOptions) {
  return useQuery({
    queryKey: messagingKeys.templates(businessId),
    queryFn: () => listMessagingTemplates(businessId, accessToken),
    enabled: Boolean(businessId),
    retry: false,
  });
}

export function useUpdateMessagingTemplate({ businessId, accessToken }: MessagingQueryOptions) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateType, content }: { templateType: MessagingAutomationType; content: string }) =>
      updateMessagingTemplate(businessId, templateType, content, accessToken),
    onSuccess: (updated) => queryClient.setQueryData(messagingKeys.templates(businessId), (current: typeof updated[] | undefined) => {
      const withoutCurrent = current?.filter((template) => template.templateType !== updated.templateType) ?? [];
      return [...withoutCurrent, updated];
    }),
  });
}

