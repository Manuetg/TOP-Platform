import { Injectable } from '@nestjs/common';
import { Prisma, type OutboundMessage as PrismaOutboundMessage } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { OutboundMessage } from '../domain/outbound-message.entity';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { type CreateOutboundMessageData, type OutboundMessageRepository, type TransactionalOutboundMessageRepository } from '../domain/outbound-message.repository';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';

@Injectable()
export class PrismaOutboundMessageRepository implements OutboundMessageRepository, TransactionalOutboundMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPending(data: CreateOutboundMessageData): Promise<OutboundMessage> {
    return this.createPendingWithClient(this.prisma, data);
  }

  async createPendingInTransaction(transaction: unknown, data: CreateOutboundMessageData): Promise<OutboundMessage> {
    return this.createPendingWithClient(transaction as PrismaService, data);
  }

  private async createPendingWithClient(client: PrismaService, data: CreateOutboundMessageData): Promise<OutboundMessage> {
    try {
      const row = await client.outboundMessage.create({ data: { ...data, messageType: data.messageType as never, channel: data.channel as never, payload: data.payload } });
      await this.touchConversation(client, row.businessId, row.conversationId, row.createdAt);
      return this.map(row);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const existing = data.manualClientRequestId && data.conversationId
        ? await client.outboundMessage.findUniqueOrThrow({ where: { businessId_conversationId_manualClientRequestId: { businessId: data.businessId, conversationId: data.conversationId, manualClientRequestId: data.manualClientRequestId } } })
        : await client.outboundMessage.findUniqueOrThrow({ where: { integrationEventId_messageType_channel: { integrationEventId: data.integrationEventId, messageType: data.messageType as never, channel: data.channel as never } } });
      if (existing.businessId !== data.businessId) throw new Error('El evento de integración pertenece a otro negocio.');
      if (data.conversationId && existing.conversationId !== data.conversationId) throw new Error('El mensaje pertenece a otra conversación.');
      return this.map(existing);
    }
  }

  private async touchConversation(client: PrismaService, businessId: string, conversationId: string | null, occurredAt: Date): Promise<void> {
    if (!conversationId) return;
    await client.conversation.updateMany({ where: { id: conversationId, businessId, lastMessageAt: { lt: occurredAt } }, data: { lastMessageAt: occurredAt } });
  }

  async findByIdAndBusinessId(id: string, businessId: string): Promise<OutboundMessage | null> {
    const row = await this.prisma.outboundMessage.findFirst({ where: { id, businessId } });
    return row ? this.map(row) : null;
  }

  async markSent(id: string, businessId: string, providerMessageId: string, sentAt: Date): Promise<OutboundMessage | null> {
    const result = await this.prisma.outboundMessage.updateMany({ where: { id, businessId, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'SENT', providerMessageId, sentAt, failedAt: null, lastError: null } });
    if (result.count !== 1) return this.findByIdAndBusinessId(id, businessId);
    return this.findByIdAndBusinessId(id, businessId);
  }

  async markFailed(id: string, businessId: string, failedAt: Date, lastError: string): Promise<OutboundMessage | null> {
    const result = await this.prisma.outboundMessage.updateMany({ where: { id, businessId, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'FAILED', failedAt, lastError } });
    if (result.count !== 1) return this.findByIdAndBusinessId(id, businessId);
    return this.findByIdAndBusinessId(id, businessId);
  }

  private map(row: PrismaOutboundMessage): OutboundMessage {
    return OutboundMessage.create({ id: row.id, businessId: row.businessId, integrationEventId: row.integrationEventId, conversationId: row.conversationId, manualClientRequestId: row.manualClientRequestId, channel: row.channel as MessagingChannel, recipient: row.recipient, messageType: row.messageType as OutboundMessageType, status: row.status as OutboundMessageStatus, payload: row.payload as OutboundMessage['payload'], providerMessageId: row.providerMessageId, createdAt: row.createdAt, sentAt: row.sentAt, failedAt: row.failedAt, lastError: row.lastError });
  }
}
