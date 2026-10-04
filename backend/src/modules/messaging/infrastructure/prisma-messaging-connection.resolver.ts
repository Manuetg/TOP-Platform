import { Injectable } from '@nestjs/common';
import { MessagingConnectionStatus as PrismaMessagingConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { ActiveMessagingConnection, MessagingConnectionResolution, MessagingConnectionResolver, MessagingOutboundConnectionResolver } from '../domain/messaging-connection.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { MessagingConnectionProvider } from '../domain/messaging-provider.enum';

@Injectable()
export class PrismaMessagingConnectionResolver implements MessagingConnectionResolver, MessagingOutboundConnectionResolver {
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
      select: { id: true, businessId: true, channel: true, provider: true, providerPhoneNumberId: true, status: true },
    });
    return row ? this.map(row) : null;
  }

  async resolveActiveConnectionById(input: { connectionId: string; businessId: string }): Promise<ActiveMessagingConnection | null> {
    const row = await this.prisma.messagingConnection.findFirst({
      where: { id: input.connectionId, businessId: input.businessId, status: PrismaMessagingConnectionStatus.ACTIVE },
      select: { id: true, businessId: true, channel: true, provider: true, providerPhoneNumberId: true, status: true },
    });
    return row ? this.map(row) : null;
  }

  async resolveForBusiness(input: { businessId: string; channel: MessagingChannel; provider?: MessagingConnectionProvider }): Promise<MessagingConnectionResolution> {
    const rows = await this.prisma.messagingConnection.findMany({
      where: { businessId: input.businessId, channel: input.channel, status: PrismaMessagingConnectionStatus.ACTIVE, ...(input.provider ? { provider: input.provider } : {}) },
      orderBy: { id: 'asc' },
      select: { id: true, businessId: true, channel: true, provider: true, providerPhoneNumberId: true, status: true },
    });
    if (rows.length === 0) return { kind: 'NOT_CONFIGURED' };
    if (rows.length > 1) return { kind: 'AMBIGUOUS', count: rows.length };
    return { kind: 'RESOLVED', connection: this.map(rows[0]) };
  }

  private map(row: { id: string; businessId: string; channel: string; provider: string; providerPhoneNumberId: string; status: string }): ActiveMessagingConnection {
    return { connectionId: row.id, businessId: row.businessId, channel: row.channel as MessagingChannel, provider: row.provider as MessagingConnectionProvider, providerPhoneNumberId: row.providerPhoneNumberId, status: 'ACTIVE' };
  }
}
