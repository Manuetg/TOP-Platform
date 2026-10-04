import { MessagingChannel } from './messaging-channel.enum';
import { MessagingConnectionProvider } from './messaging-provider.enum';

export interface ActiveMessagingConnection {
  connectionId: string;
  businessId: string;
}

export interface MessagingConnectionResolver {
  resolveActiveConnection(input: {
    provider: MessagingConnectionProvider;
    channel: MessagingChannel;
    providerPhoneNumberId: string;
  }): Promise<ActiveMessagingConnection | null>;
}

export const MESSAGING_CONNECTION_RESOLVER = Symbol('MESSAGING_CONNECTION_RESOLVER');
