import { MessagingConnectionProvider } from './messaging-provider.enum';
import { MessagingProviderCredentialStatus } from './messaging-provider-credential-status.enum';
import { MessagingProviderCredentialType } from './messaging-provider-credential-type.enum';

export interface MessagingProviderCredentialRecord {
  id: string;
  connectionId: string;
  businessId: string;
  provider: MessagingConnectionProvider;
  credentialType: MessagingProviderCredentialType;
  secretReference: string;
  secretFingerprint: string | null;
  status: MessagingProviderCredentialStatus;
  issuedAt: Date | null;
  expiresAt: Date | null;
  lastValidatedAt: Date | null;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessagingProviderCredentialRepository {
  findForConnection(input: { connectionId: string; businessId: string; credentialType: MessagingProviderCredentialType }): Promise<MessagingProviderCredentialRecord | null>;
  upsert(input: {
    connectionId: string;
    businessId: string;
    provider: MessagingConnectionProvider;
    credentialType: MessagingProviderCredentialType;
    secretReference: string;
    secretFingerprint?: string | null;
    status?: MessagingProviderCredentialStatus;
    issuedAt?: Date | null;
    expiresAt?: Date | null;
    lastValidatedAt?: Date | null;
    rotatedAt?: Date | null;
    revokedAt?: Date | null;
  }): Promise<MessagingProviderCredentialRecord>;
}

export const MESSAGING_PROVIDER_CREDENTIAL_REPOSITORY = Symbol('MESSAGING_PROVIDER_CREDENTIAL_REPOSITORY');
