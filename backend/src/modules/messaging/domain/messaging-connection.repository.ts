import { MessagingChannel } from './messaging-channel.enum';
import { MessagingConnectionProvider } from './messaging-provider.enum';

export interface ActiveMessagingConnection {
  connectionId: string;
  businessId: string;
  channel: MessagingChannel;
  provider: MessagingConnectionProvider;
  providerPhoneNumberId: string;
  status: 'ACTIVE';
}

export type MessagingConnectionResolution =
  | { kind: 'RESOLVED'; connection: ActiveMessagingConnection }
  | { kind: 'NOT_CONFIGURED' }
  | { kind: 'AMBIGUOUS'; count: number };

export interface MessagingConnectionResolver {
  resolveActiveConnection(input: {
    provider: MessagingConnectionProvider;
    channel: MessagingChannel;
    providerPhoneNumberId: string;
  }): Promise<ActiveMessagingConnection | null>;
  resolveActiveConnectionById(input: { connectionId: string; businessId: string }): Promise<ActiveMessagingConnection | null>;
}

export interface MessagingOutboundConnectionResolver {
  resolveActiveConnectionById(input: { connectionId: string; businessId: string }): Promise<ActiveMessagingConnection | null>;
  resolveForBusiness(input: { businessId: string; channel: MessagingChannel; provider?: MessagingConnectionProvider }): Promise<MessagingConnectionResolution>;
}

export const MESSAGING_CONNECTION_RESOLVER = Symbol('MESSAGING_CONNECTION_RESOLVER');
export const MESSAGING_OUTBOUND_CONNECTION_RESOLVER = Symbol('MESSAGING_OUTBOUND_CONNECTION_RESOLVER');
