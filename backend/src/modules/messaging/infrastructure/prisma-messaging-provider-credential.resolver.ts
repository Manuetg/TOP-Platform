import { Inject, Injectable } from '@nestjs/common';
import {
  MessagingProviderCredentialExpiredError,
  MessagingProviderCredentialNotConfiguredError,
  MessagingProviderCredentialProviderMismatchError,
  MessagingProviderCredentialRevokedError,
  MessagingProviderCredentialSecretUnavailableError,
  type MessagingProviderCredentialResolver,
  type MessagingProviderCredentials,
} from '../application/messaging-provider-credentials';
import { MESSAGING_SECRET_STORE, type MessagingSecretStore } from '../application/messaging-secret-store';
import { MESSAGING_PROVIDER_CREDENTIAL_REPOSITORY, type MessagingProviderCredentialRepository } from '../domain/messaging-provider-credential.repository';
import { MessagingProviderCredentialStatus } from '../domain/messaging-provider-credential-status.enum';
import { MessagingProviderCredentialType } from '../domain/messaging-provider-credential-type.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

@Injectable()
export class PrismaMessagingProviderCredentialResolver implements MessagingProviderCredentialResolver {
  constructor(
    @Inject(MESSAGING_PROVIDER_CREDENTIAL_REPOSITORY) private readonly credentials: MessagingProviderCredentialRepository,
    @Inject(MESSAGING_SECRET_STORE) private readonly secrets: MessagingSecretStore,
  ) {}

  async resolve(input: { connectionId: string; businessId: string; provider: MessagingConnectionProvider }): Promise<MessagingProviderCredentials> {
    this.validateInput(input);

    const credential = await this.credentials.findForConnection({ connectionId: input.connectionId, businessId: input.businessId, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN });
    if (!credential) throw new MessagingProviderCredentialNotConfiguredError('La conexión de Messaging no tiene una credencial configurada.');
    this.validateCredential(credential, input.provider);

    let secret: string | null;
    try {
      secret = await this.secrets.getSecret(credential.secretReference);
    } catch {
      throw new MessagingProviderCredentialSecretUnavailableError('El secreto de la credencial de Messaging no está disponible.');
    }
    if (!secret) throw new MessagingProviderCredentialSecretUnavailableError('El secreto de la credencial de Messaging no está disponible.');
    return { accessToken: secret };
  }

  private validateInput(input: { connectionId: string; businessId: string; provider: MessagingConnectionProvider }): void {
    if (!input.connectionId || !input.businessId) throw new MessagingProviderCredentialNotConfiguredError('La conexión de Messaging seleccionada no es válida.');
    if (input.provider !== MessagingConnectionProvider.META_WHATSAPP) throw new MessagingProviderCredentialProviderMismatchError('No existe una credencial para el provider seleccionado.');
  }

  private validateCredential(credential: { provider: MessagingConnectionProvider; status: MessagingProviderCredentialStatus; expiresAt: Date | null }, provider: MessagingConnectionProvider): void {
    if (credential.provider !== provider) throw new MessagingProviderCredentialProviderMismatchError('La credencial no corresponde al provider seleccionado.');
    if (credential.status === MessagingProviderCredentialStatus.REVOKED) throw new MessagingProviderCredentialRevokedError('La credencial de Messaging fue revocada.');
    if (credential.status === MessagingProviderCredentialStatus.EXPIRED || (credential.expiresAt !== null && credential.expiresAt.getTime() <= Date.now())) throw new MessagingProviderCredentialExpiredError('La credencial de Messaging expiró.');
  }
}
