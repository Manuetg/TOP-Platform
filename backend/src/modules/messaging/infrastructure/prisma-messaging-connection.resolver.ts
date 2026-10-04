import { Injectable } from '@nestjs/common';
import { MessagingConnectionStatus as PrismaMessagingConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { ActiveMessagingConnection, MessagingConnectionResolver } from '../domain/messaging-connection.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

@Injectable()
export class PrismaMessagingConnectionResolver implements MessagingConnectionResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveActiveConnection(input: { provider: MessagingConnectionProvider; channel: MessagingChannel; providerPhoneNumberId: string }): Promise<ActiveMessagingConnection | null> {
    if (!Object.values(MessagingConnectionProvider).includes(input.provider) || !Object.values(MessagingChannel).includes(input.channel)) return null;

    const row = await this.prisma.messagingConnection.findFirst({
      where: {
        provider: input.provider,
        channel: input.channel,
        providerPhoneNumberId: input.providerPhoneNumberId,
        status: PrismaMessagingConnectionStatus.ACTIVE,
      },
      select: { id: true, businessId: true },
    });
    return row ? { connectionId: row.id, businessId: row.businessId } : null;
  }
}
