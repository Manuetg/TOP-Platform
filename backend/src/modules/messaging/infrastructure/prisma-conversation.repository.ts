import { Injectable } from '@nestjs/common';
import type { Conversation as PrismaConversation } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Conversation } from '../domain/conversation.entity';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import type { ConversationRepository } from '../domain/conversation.repository';

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdAndBusinessId(id: string, businessId: string): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findFirst({ where: { id, businessId } });
    return row ? this.map(row) : null;
  }

  async findActiveByParticipant(businessId: string, channel: MessagingChannel, externalParticipant: string, messagingConnectionId?: string | null): Promise<Conversation | null> {
    const row = await this.prisma.conversation.findFirst({ where: { businessId, channel, externalParticipant, ...(messagingConnectionId ? { messagingConnectionId } : { messagingConnectionId: null }), status: ConversationStatus.ACTIVE }, orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }] });
    return row ? this.map(row) : null;
  }

  async setMode(id: string, businessId: string, mode: ConversationMode): Promise<Conversation | null> {
    await this.prisma.conversation.updateMany({ where: { id, businessId, status: ConversationStatus.ACTIVE }, data: { mode } });
    return this.findByIdAndBusinessId(id, businessId);
  }

  private map(row: PrismaConversation): Conversation {
    return Conversation.create({ id: row.id, businessId: row.businessId, channel: row.channel as MessagingChannel, externalParticipant: row.externalParticipant, messagingConnectionId: row.messagingConnectionId, contactId: row.contactId, mode: row.mode as ConversationMode, status: row.status as ConversationStatus, createdAt: row.createdAt, lastMessageAt: row.lastMessageAt, closedAt: row.closedAt });
  }
}
