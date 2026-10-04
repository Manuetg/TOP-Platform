import { OutboundMessage } from '../domain/outbound-message.entity';

export interface MessagingProviderResult {
  providerMessageId: string;
}

export interface MessagingProvider {
  send(message: OutboundMessage): Promise<MessagingProviderResult>;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
