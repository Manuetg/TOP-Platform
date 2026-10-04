import type { MetaWhatsAppConfiguration } from '../../../config/environment';
import type { MessagingProviderCredentialResolver, MessagingProviderCredentials } from '../application/messaging-provider-credentials';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

export class EnvironmentMessagingProviderCredentialResolver implements MessagingProviderCredentialResolver {
  constructor(private readonly configuration: MetaWhatsAppConfiguration) {}

  resolve(input: { connectionId: string; businessId: string; provider: MessagingConnectionProvider }): Promise<MessagingProviderCredentials> {
    if (input.provider !== MessagingConnectionProvider.META_WHATSAPP) throw new Error('No existe un resolver de credenciales para el provider seleccionado.');
    if (!input.connectionId || !input.businessId) throw new Error('La conexión de Messaging seleccionada no es válida.');
    return Promise.resolve({ accessToken: this.configuration.accessToken });
  }
}
