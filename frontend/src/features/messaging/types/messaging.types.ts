export type MessagingAutomationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED";

export type MessagingChannel = "WHATSAPP";

export interface MessagingSettings {
  businessId: string;
  botEnabled: boolean;
}

export interface MessagingAutomationRule {
  id: string | null;
  businessId: string;
  automationType: MessagingAutomationType;
  enabled: boolean;
  templateId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MessagingMessageTemplate {
  id: string;
  businessId: string;
  templateType: MessagingAutomationType;
  channel: MessagingChannel;
  content: string;
  createdAt: string;
  updatedAt: string;
}

