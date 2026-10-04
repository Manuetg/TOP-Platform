import { PrismaClient } from '@prisma/client';
import { PrismaMessagingConnectionResolver } from '../../src/modules/messaging/infrastructure/prisma-messaging-connection.resolver';
import { MessagingChannel } from '../../src/modules/messaging/domain/messaging-channel.enum';
import { MessagingConnectionStatus } from '../../src/modules/messaging/domain/messaging-connection-status.enum';
import { MessagingConnectionProvider } from '../../src/modules/messaging/domain/messaging-provider.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('MessagingConnection PostgreSQL', () => {
  const prisma = new PrismaClient();
  const resolver = new PrismaMessagingConnectionResolver(prisma);

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

  async function connection(businessId: string, providerPhoneNumberId: string, status: MessagingConnectionStatus = MessagingConnectionStatus.ACTIVE) {
    return prisma.messagingConnection.create({ data: { businessId, provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId, status } });
  }

  it('resuelve el Business correcto desde una conexión ACTIVE', async () => {
    const owner = await business('Owner');
    const created = await connection(owner.id, 'phone-a');

    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'phone-a' })).resolves.toEqual({ connectionId: created.id, businessId: owner.id, channel: MessagingChannel.WHATSAPP, provider: MessagingConnectionProvider.META_WHATSAPP, providerPhoneNumberId: 'phone-a', status: 'ACTIVE' });
  });

  it('no resuelve conexiones INACTIVE ni ids desconocidos', async () => {
    const owner = await business('Owner');
    await connection(owner.id, 'inactive', MessagingConnectionStatus.INACTIVE);

    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'inactive' })).resolves.toBeNull();
    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'unknown' })).resolves.toBeNull();
  });

  it('no cruza Business y permite múltiples números por Business', async () => {
    const first = await business('First');
    const second = await business('Second');
    await connection(first.id, 'phone-first');
    await connection(first.id, 'phone-second');
    await connection(second.id, 'phone-other');

    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'phone-second' })).resolves.toMatchObject({ businessId: first.id });
    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'phone-other' })).resolves.toMatchObject({ businessId: second.id });
    await expect(prisma.messagingConnection.count({ where: { businessId: first.id } })).resolves.toBe(2);
  });

  it('rechaza asociar el mismo phone number id al mismo provider y channel', async () => {
    const first = await business('First');
    const second = await business('Second');
    const results = await Promise.allSettled([connection(first.id, 'phone-unique'), connection(second.id, 'phone-unique')]);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rejected?.reason).toMatchObject({ code: 'P2002' });
  });

  it('provider o channel distintos no hacen match', async () => {
    const owner = await business('Owner');
    await connection(owner.id, 'phone-provider');

    await expect(resolver.resolveActiveConnection({ provider: 'UNSUPPORTED' as MessagingConnectionProvider, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'phone-provider' })).resolves.toBeNull();
    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: 'OTHER' as MessagingChannel, providerPhoneNumberId: 'phone-provider' })).resolves.toBeNull();
  });
});
