import { Injectable } from '@nestjs/common';
import type { InboundMessage as PrismaInboundMessage } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { InboundMessage } from '../domain/inbound-message.entity';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { InboundMessageType } from '../domain/inbound-message-type.enum';
import type { InboundMessageRepository } from '../domain/inbound-message.repository';

@Injectable()
export class PrismaInboundMessageRepository implements InboundMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdAndBusinessId(id: string, businessId: string): Promise<InboundMessage | null> {
    const row = await this.prisma.inboundMessage.findFirst({ where: { id, businessId } });
    return row ? this.map(row) : null;
  }

  async listByConversationAndBusinessId(conversationId: string, businessId: string): Promise<InboundMessage[]> {
    const rows = await this.prisma.inboundMessage.findMany({ where: { conversationId, businessId }, orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }] });
    return rows.map((row) => this.map(row));
  }

  private map(row: PrismaInboundMessage): InboundMessage {
    return InboundMessage.create({ id: row.id, businessId: row.businessId, conversationId: row.conversationId, channel: row.channel as MessagingChannel, providerMessageId: row.providerMessageId, sender: row.sender, messageType: row.messageType as InboundMessageType, payload: row.payload as InboundMessage['payload'], receivedAt: row.receivedAt, createdAt: row.createdAt });
  }
}
