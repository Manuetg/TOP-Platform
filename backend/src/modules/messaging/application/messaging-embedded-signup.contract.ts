import type { MessagingSecretStore } from './messaging-secret-store';

export interface MetaWhatsAppEmbeddedSignupConfiguration {
  environment: 'development' | 'test' | 'production';
  graphApiVersion: string;
  appId?: string;
  appSecret?: string;
  configurationId?: string;
  attemptTtlSeconds: number;
  processingTimeoutSeconds: number;
}

export interface MessagingConnectionOnboardingTransaction {
  findExistingConnection(input: { businessId: string; providerPhoneNumberId: string }): Promise<ExistingMessagingConnection | null>;
  findConnectionForProviderPhone(input: { providerPhoneNumberId: string }): Promise<ExistingMessagingConnection | null>;
  complete(input: {
    attemptId: string;
    businessId: string;
    connectionId: string;
    providerPhoneNumberId: string;
    providerWabaId: string;
    providerBusinessPortfolioId: string | null;
    secretReference: string;
    issuedAt: Date;
    expiresAt: Date | null;
    now: Date;
  }): Promise<{ connectionId: string; previousSecretReference: string | null }>;
}

export interface ExistingMessagingConnection {
  id: string;
  businessId: string;
  providerPhoneNumberId: string;
  providerWabaId: string | null;
  providerBusinessPortfolioId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export const MESSAGING_CONNECTION_ONBOARDING_TRANSACTION = Symbol('MESSAGING_CONNECTION_ONBOARDING_TRANSACTION');
export const META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION = Symbol('META_WHATSAPP_EMBEDDED_SIGNUP_CONFIGURATION');

export interface MessagingOnboardingWritableSecretStore extends MessagingSecretStore {
  isWritable?(): boolean;
}
