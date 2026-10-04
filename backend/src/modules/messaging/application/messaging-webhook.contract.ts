import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';

export interface MessagingWebhookRouting {
  provider: MessagingConnectionProvider;
  channel: MessagingChannel;
  providerPhoneNumberId: string;
}

export interface MessagingInboundTextWebhookEvent extends MessagingWebhookRouting {
  kind: 'INBOUND_TEXT';
  providerMessageId: string;
  sender: string;
  text: string;
  occurredAt: Date;
}

export interface MessagingDeliveryStatusWebhookEvent extends MessagingWebhookRouting {
  kind: 'DELIVERY_STATUS';
  providerMessageId: string;
  status: OutboundMessageStatus;
  occurredAt: Date;
  lastError: string | null;
}

export type MessagingWebhookEvent = MessagingInboundTextWebhookEvent | MessagingDeliveryStatusWebhookEvent;

export interface MessagingWebhookHandler {
  execute(events: readonly MessagingWebhookEvent[]): Promise<void>;
}
