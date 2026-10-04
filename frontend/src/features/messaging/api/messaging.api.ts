import { apiRequest } from "../../../shared/api/api-client";
import type {
  MessagingAutomationRule,
  MessagingAutomationType,
  MessagingMessageTemplate,
  MessagingSettings,
} from "../types/messaging.types";

function basePath(businessId: string): string {
  return `/businesses/${businessId}/messaging`;
}

export function getMessagingSettings(
  businessId: string,
  accessToken?: string | null,
): Promise<MessagingSettings> {
  return apiRequest<MessagingSettings>(`${basePath(businessId)}/settings`, { accessToken });
}

export function updateMessagingSettings(
  businessId: string,
  botEnabled: boolean,
  accessToken?: string | null,
): Promise<MessagingSettings> {
  return apiRequest<MessagingSettings>(`${basePath(businessId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify({ botEnabled }),
    accessToken,
  });
}

export function listMessagingAutomations(
  businessId: string,
  accessToken?: string | null,
): Promise<MessagingAutomationRule[]> {
  return apiRequest<MessagingAutomationRule[]>(`${basePath(businessId)}/automations`, { accessToken });
}

export function updateMessagingAutomation(
  businessId: string,
  automationType: MessagingAutomationType,
  enabled: boolean,
  accessToken?: string | null,
): Promise<MessagingAutomationRule> {
  return apiRequest<MessagingAutomationRule>(
    `${basePath(businessId)}/automations/${automationType}`,
    { method: "PATCH", body: JSON.stringify({ enabled }), accessToken },
  );
}

export function listMessagingTemplates(
  businessId: string,
  accessToken?: string | null,
): Promise<MessagingMessageTemplate[]> {
  return apiRequest<MessagingMessageTemplate[]>(`${basePath(businessId)}/templates`, { accessToken });
}

export function updateMessagingTemplate(
  businessId: string,
  templateType: MessagingAutomationType,
  content: string,
  accessToken?: string | null,
): Promise<MessagingMessageTemplate> {
  return apiRequest<MessagingMessageTemplate>(
    `${basePath(businessId)}/templates/${templateType}`,
    { method: "PATCH", body: JSON.stringify({ content }), accessToken },
  );
}

