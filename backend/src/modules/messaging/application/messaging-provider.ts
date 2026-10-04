import { OutboundMessage } from '../domain/outbound-message.entity';
import type { ActiveMessagingConnection } from '../domain/messaging-connection.repository';
import type { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

export interface MessagingProviderResult {
  providerMessageId: string;
}

export interface MessagingProvider {
  send(message: OutboundMessage, connection?: ActiveMessagingConnection): Promise<MessagingProviderResult>;
  supports?(provider: MessagingConnectionProvider): boolean;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
