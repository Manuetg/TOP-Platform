import type { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

export interface MessagingProviderCredentials {
  accessToken: string;
}

export interface MessagingProviderCredentialResolver {
  resolve(input: { connectionId: string; businessId: string; provider: MessagingConnectionProvider }): Promise<MessagingProviderCredentials>;
}

export const MESSAGING_PROVIDER_CREDENTIAL_RESOLVER = Symbol('MESSAGING_PROVIDER_CREDENTIAL_RESOLVER');
