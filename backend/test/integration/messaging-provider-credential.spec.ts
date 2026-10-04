import { PrismaClient } from '@prisma/client';
import { PrismaMessagingProviderCredentialRepository } from '../../src/modules/messaging/infrastructure/prisma-messaging-provider-credential.repository';
import { PrismaMessagingProviderCredentialResolver } from '../../src/modules/messaging/infrastructure/prisma-messaging-provider-credential.resolver';
import { MessagingProviderCredentialStatus } from '../../src/modules/messaging/domain/messaging-provider-credential-status.enum';
import { MessagingProviderCredentialType } from '../../src/modules/messaging/domain/messaging-provider-credential-type.enum';
import { MessagingChannel } from '../../src/modules/messaging/domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../../src/modules/messaging/domain/messaging-provider.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('MessagingProviderCredential PostgreSQL', () => {
  const prisma = new PrismaClient();
  const credentials = new PrismaMessagingProviderCredentialRepository(prisma);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.$disconnect();
  });

  async function business(name: string) {
    return prisma.business.create({ data: { name: `${name} ${crypto.randomUUID()}` } });
  }

  async function connection(businessId: string, phoneNumberId: string, providerWabaId = 'waba-shared') {
    return prisma.messagingConnection.create({ data: { businessId, channel: MessagingChannel.WHATSAPP, provider: MessagingConnectionProvider.META_WHATSAPP, providerPhoneNumberId: phoneNumberId, providerWabaId } });
  }

  it('persiste una credential vinculada a su connection y conserva el WABA', async () => {
    const owner = await business('Owner');
    const created = await connection(owner.id, 'phone-one');

    const credential = await credentials.upsert({ connectionId: created.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'env://META_WHATSAPP_ACCESS_TOKEN' });
    const stored = await prisma.messagingProviderCredential.findUniqueOrThrow({ where: { id: credential.id }, include: { connection: true } });

    expect(stored.connectionId).toBe(created.id);
    expect(stored.connection.businessId).toBe(owner.id);
    expect(stored.connection.providerWabaId).toBe('waba-shared');
    expect(stored.secretReference).toBe('env://META_WHATSAPP_ACCESS_TOKEN');
    expect(stored).not.toHaveProperty('accessToken');
  });

  it('no permite resolver una credential desde otro Business', async () => {
    const owner = await business('Owner');
    const other = await business('Other');
    const created = await connection(owner.id, 'phone-one');
    await credentials.upsert({ connectionId: created.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'env://META_WHATSAPP_ACCESS_TOKEN' });

    await expect(credentials.findForConnection({ connectionId: created.id, businessId: other.id, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN })).resolves.toBeNull();
  });

  it('mantiene una sola credential por connection y credentialType', async () => {
    const owner = await business('Owner');
    const created = await connection(owner.id, 'phone-one');
    const input = { connectionId: created.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN };

    const first = await credentials.upsert({ ...input, secretReference: 'env://META_WHATSAPP_ACCESS_TOKEN' });
    const second = await credentials.upsert({ ...input, secretReference: 'secret-manager://credential/v2' });

    expect(second.id).toBe(first.id);
    await expect(prisma.messagingProviderCredential.count({ where: { connectionId: created.id } })).resolves.toBe(1);
    await expect(credentials.findForConnection({ ...input })).resolves.toMatchObject({ id: first.id, secretReference: 'secret-manager://credential/v2' });
  });

  it('permite dos connections con el mismo WABA y credentials diferentes', async () => {
    const owner = await business('Owner');
    const first = await connection(owner.id, 'phone-one');
    const second = await connection(owner.id, 'phone-two');

    await credentials.upsert({ connectionId: first.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'secret-manager://credential/one' });
    await credentials.upsert({ connectionId: second.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'secret-manager://credential/two' });

    const stored = await prisma.messagingConnection.findMany({ where: { businessId: owner.id }, orderBy: { providerPhoneNumberId: 'asc' }, select: { providerWabaId: true, providerPhoneNumberId: true } });
    expect(stored).toEqual([{ providerWabaId: 'waba-shared', providerPhoneNumberId: 'phone-one' }, { providerWabaId: 'waba-shared', providerPhoneNumberId: 'phone-two' }]);
    await expect(credentials.findForConnection({ connectionId: first.id, businessId: owner.id, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN })).resolves.toMatchObject({ secretReference: 'secret-manager://credential/one' });
    await expect(credentials.findForConnection({ connectionId: second.id, businessId: owner.id, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN })).resolves.toMatchObject({ secretReference: 'secret-manager://credential/two' });
  });

  it('el resolver no usa credentials EXPIRED o REVOKED', async () => {
    const owner = await business('Owner');
    const created = await connection(owner.id, 'phone-one');
    const secretStore = { getSecret: jest.fn().mockResolvedValue('token-never-logged') };
    const resolver = new PrismaMessagingProviderCredentialResolver(credentials, secretStore);

    for (const status of [MessagingProviderCredentialStatus.EXPIRED, MessagingProviderCredentialStatus.REVOKED]) {
      await credentials.upsert({ connectionId: created.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'secret-manager://credential/one', status });
      await expect(resolver.resolve({ connectionId: created.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP })).rejects.toThrow(status === MessagingProviderCredentialStatus.EXPIRED ? 'expiró' : 'revocada');
    }
    expect(secretStore.getSecret).not.toHaveBeenCalled();
  });

  it('restringe borrar una connection mientras conserva una credential', async () => {
    const owner = await business('Owner');
    const created = await connection(owner.id, 'phone-one');
    await credentials.upsert({ connectionId: created.id, businessId: owner.id, provider: MessagingConnectionProvider.META_WHATSAPP, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN, secretReference: 'secret-manager://credential/one' });

    await expect(prisma.messagingConnection.delete({ where: { id: created.id } })).rejects.toMatchObject({ code: 'P2003' });
    await prisma.messagingProviderCredential.delete({ where: { connectionId_credentialType: { connectionId: created.id, credentialType: MessagingProviderCredentialType.BUSINESS_TOKEN } } });
    await expect(prisma.messagingConnection.delete({ where: { id: created.id } })).resolves.toMatchObject({ id: created.id });
  });
});
