import { PrismaMessagingConnectionResolver } from './prisma-messaging-connection.resolver';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

describe('PrismaMessagingConnectionResolver', () => {
  it('resuelve únicamente conexiones activas por provider, channel y phone number id', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'connection-id', businessId: 'business-id', channel: MessagingChannel.WHATSAPP, provider: MessagingConnectionProvider.META_WHATSAPP, providerPhoneNumberId: '123456789', status: 'ACTIVE' });
    const resolver = new PrismaMessagingConnectionResolver({ messagingConnection: { findFirst } } as never);

    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: '123456789' })).resolves.toEqual({ connectionId: 'connection-id', businessId: 'business-id', channel: MessagingChannel.WHATSAPP, provider: MessagingConnectionProvider.META_WHATSAPP, providerPhoneNumberId: '123456789', status: 'ACTIVE' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { provider: 'META_WHATSAPP', channel: 'WHATSAPP', providerPhoneNumberId: '123456789', status: 'ACTIVE' },
      select: { id: true, businessId: true, channel: true, provider: true, providerPhoneNumberId: true, status: true },
    });
  });

  it('devuelve null cuando no existe una conexión activa', async () => {
    const resolver = new PrismaMessagingConnectionResolver({ messagingConnection: { findFirst: jest.fn().mockResolvedValue(null) } } as never);

    await expect(resolver.resolveActiveConnection({ provider: MessagingConnectionProvider.META_WHATSAPP, channel: MessagingChannel.WHATSAPP, providerPhoneNumberId: 'unknown' })).resolves.toBeNull();
  });
});
