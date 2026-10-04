import { ConfigService } from '@nestjs/config';
import { readMetaWhatsAppConfiguration } from '../../../config/environment';
import { EnvironmentMessagingSecretStore, EnvironmentMessagingSecretStoreDisabledError, META_ACCESS_TOKEN_REFERENCE } from './environment-messaging-secret.store';

describe('EnvironmentMessagingSecretStore', () => {
  const configuration = readMetaWhatsAppConfiguration(new ConfigService({ NODE_ENV: 'development', META_WHATSAPP_ACCESS_TOKEN: 'token-never-logged', META_WHATSAPP_GRAPH_API_VERSION: 'v26.0' }));

  it('solo resuelve la referencia env permitida en development', async () => {
    const store = new EnvironmentMessagingSecretStore(configuration, 'development');

    await expect(store.getSecret(META_ACCESS_TOKEN_REFERENCE)).resolves.toBe('token-never-logged');
    await expect(store.getSecret('env://OTHER_SECRET')).resolves.toBeNull();
  });

  it('no permite referencias de environment en production', async () => {
    const store = new EnvironmentMessagingSecretStore(configuration, 'production');

    await expect(store.getSecret(META_ACCESS_TOKEN_REFERENCE)).rejects.toBeInstanceOf(EnvironmentMessagingSecretStoreDisabledError);
    await expect(store.getSecret(META_ACCESS_TOKEN_REFERENCE)).rejects.not.toThrow('token-never-logged');
  });
});
