import {
  MessagingProviderCredentialExpiredError,
  MessagingProviderCredentialNotConfiguredError,
  MessagingProviderCredentialProviderMismatchError,
  MessagingProviderCredentialRevokedError,
  MessagingProviderCredentialSecretUnavailableError,
} from '../application/messaging-provider-credentials';
import type { MessagingSecretStore } from '../application/messaging-secret-store';
import type { MessagingProviderCredentialRecord, MessagingProviderCredentialRepository } from '../domain/messaging-provider-credential.repository';
import { MessagingProviderCredentialStatus } from '../domain/messaging-provider-credential-status.enum';
import { MessagingProviderCredentialType } from '../domain/messaging-provider-credential-type.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';
import { PrismaMessagingProviderCredentialResolver } from './prisma-messaging-provider-credential.resolver';

const input = { connectionId: 'connection-id', businessId: 'business-id', provider: MessagingConnectionProvider.META_WHATSAPP };

function credential(overrides: Partial<MessagingProviderCredentialRecord> = {}): MessagingProviderCredentialRecord {
  const now = new Date('2026-10-04T12:00:00.000Z');
  return {
    id: 'credential-id', connectionId: input.connectionId, businessId: input.businessId, provider: input.provider,
    credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'env://META_WHATSAPP_ACCESS_TOKEN', secretFingerprint: null,
    status: MessagingProviderCredentialStatus.ACTIVE, issuedAt: now, expiresAt: null, lastValidatedAt: null, rotatedAt: null, revokedAt: null,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function resolver(record: MessagingProviderCredentialRecord | null, secret: string | null = 'token-never-logged') {
  const findForConnection = jest.fn().mockResolvedValue(record);
  const upsert = jest.fn();
  const getSecret = jest.fn().mockResolvedValue(secret);
  const repository: MessagingProviderCredentialRepository = { findForConnection, upsert };
  const secrets: MessagingSecretStore = { getSecret };
  return { resolver: new PrismaMessagingProviderCredentialResolver(repository, secrets), findForConnection, getSecret };
}

describe('PrismaMessagingProviderCredentialResolver', () => {
  it('resuelve una credencial ACTIVE y obtiene el secreto transitorio', async () => {
    const test = resolver(credential());

    await expect(test.resolver.resolve(input)).resolves.toEqual({ accessToken: 'token-never-logged' });
    expect(test.findForConnection).toHaveBeenCalledWith({ connectionId: input.connectionId, businessId: input.businessId, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN });
    expect(test.getSecret).toHaveBeenCalledWith('env://META_WHATSAPP_ACCESS_TOKEN');
  });

  it.each([
    [MessagingProviderCredentialStatus.EXPIRED, MessagingProviderCredentialExpiredError],
    [MessagingProviderCredentialStatus.REVOKED, MessagingProviderCredentialRevokedError],
  ] as const)('rechaza una credencial con estado %s', async (status, ErrorType) => {
    const test = resolver(credential({ status }));

    await expect(test.resolver.resolve(input)).rejects.toBeInstanceOf(ErrorType);
    expect(test.getSecret).not.toHaveBeenCalled();
  });

  it('rechaza una credencial ACTIVE cuya expiracion ya paso', async () => {
    const test = resolver(credential({ expiresAt: new Date('2026-10-03T12:00:00.000Z') }));

    await expect(test.resolver.resolve(input)).rejects.toBeInstanceOf(MessagingProviderCredentialExpiredError);
    expect(test.getSecret).not.toHaveBeenCalled();
  });

  it('rechaza una conexion de otro Business sin pedir el secreto', async () => {
    const test = resolver(null);

    await expect(test.resolver.resolve({ ...input, businessId: 'other-business-id' })).rejects.toBeInstanceOf(MessagingProviderCredentialNotConfiguredError);
    expect(test.findForConnection).toHaveBeenCalledWith({ connectionId: input.connectionId, businessId: 'other-business-id', credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN });
  });

  it('rechaza provider mismatch', async () => {
    const test = resolver(credential({ provider: 'UNSUPPORTED' as MessagingConnectionProvider }));

    await expect(test.resolver.resolve(input)).rejects.toBeInstanceOf(MessagingProviderCredentialProviderMismatchError);
  });

  it('rechaza credential inexistente', async () => {
    const test = resolver(null);

    await expect(test.resolver.resolve(input)).rejects.toBeInstanceOf(MessagingProviderCredentialNotConfiguredError);
  });

  it('rechaza secreto inexistente sin exponer referencias ni tokens', async () => {
    const test = resolver(credential(), null);

    await expect(test.resolver.resolve(input)).rejects.toBeInstanceOf(MessagingProviderCredentialSecretUnavailableError);
    await expect(test.resolver.resolve(input)).rejects.not.toThrow('META_WHATSAPP_ACCESS_TOKEN');
    await expect(test.resolver.resolve(input)).rejects.not.toThrow('token-never-logged');
  });
});
