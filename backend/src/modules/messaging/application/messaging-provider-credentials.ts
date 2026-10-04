import type { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

export class MessagingProviderCredentialError extends Error {}

export class MessagingProviderCredentialNotConfiguredError extends MessagingProviderCredentialError {}

export class MessagingProviderCredentialExpiredError extends MessagingProviderCredentialError {}

export class MessagingProviderCredentialRevokedError extends MessagingProviderCredentialError {}

export class MessagingProviderCredentialSecretUnavailableError extends MessagingProviderCredentialError {}

export class MessagingProviderCredentialProviderMismatchError extends MessagingProviderCredentialError {}

export interface MessagingProviderCredentials {
  accessToken: string;
}

export interface MessagingProviderCredentialResolver {
  resolve(input: { connectionId: string; businessId: string; provider: MessagingConnectionProvider }): Promise<MessagingProviderCredentials>;
}

export const MESSAGING_PROVIDER_CREDENTIAL_RESOLVER = Symbol('MESSAGING_PROVIDER_CREDENTIAL_RESOLVER');
