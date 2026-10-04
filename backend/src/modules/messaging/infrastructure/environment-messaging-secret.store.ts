import type { MetaWhatsAppConfiguration, NodeEnvironment } from '../../../config/environment';
import type { MessagingSecretStore } from '../application/messaging-secret-store';

const META_ACCESS_TOKEN_REFERENCE = 'env://META_WHATSAPP_ACCESS_TOKEN';

export class EnvironmentMessagingSecretStoreDisabledError extends Error {}

export class EnvironmentMessagingSecretStore implements MessagingSecretStore {
  constructor(private readonly configuration: MetaWhatsAppConfiguration, private readonly environment: NodeEnvironment) {}

  getSecret(reference: string): Promise<string | null> {
    if (reference !== META_ACCESS_TOKEN_REFERENCE) return Promise.resolve(null);
    if (this.environment === 'production') return Promise.reject(new EnvironmentMessagingSecretStoreDisabledError('El secret store de environment está deshabilitado en producción.'));
    return Promise.resolve(this.configuration.accessToken ?? null);
  }

  isWritable(): boolean {
    return false;
  }

  putSecret(): Promise<never> {
    return Promise.reject(new EnvironmentMessagingSecretStoreDisabledError('El secret store de environment es de solo lectura.'));
  }

  deleteSecret(): Promise<void> {
    return Promise.reject(new EnvironmentMessagingSecretStoreDisabledError('El secret store de environment es de solo lectura.'));
  }
}

export { META_ACCESS_TOKEN_REFERENCE };
