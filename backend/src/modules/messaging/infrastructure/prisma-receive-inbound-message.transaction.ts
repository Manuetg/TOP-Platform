import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { INTEGRATION_EVENT_OUTBOX, type IntegrationEventOutbox } from '../../../shared/integration-events/integration-event.outbox';
import { createIntegrationEvent, IntegrationEventType } from '../../../shared/integration-events/integration-event';
import { PrismaIntegrationEventOutbox } from '../../../shared/infrastructure/prisma-integration-event.outbox';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Conversation } from '../domain/conversation.entity';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { InboundMessage } from '../domain/inbound-message.entity';
import { InboundMessageType } from '../domain/inbound-message-type.enum';
import type { ReceiveInboundMessageResult, ReceiveInboundMessageTransaction, InboundMessageEnvelope } from '../application/receive-inbound-message.contract';

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

@Injectable()
export class PrismaReceiveInboundMessageTransaction implements ReceiveInboundMessageTransaction {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INTEGRATION_EVENT_OUTBOX) private readonly outbox: IntegrationEventOutbox = new PrismaIntegrationEventOutbox(),
  ) {}

  async receive(input: { envelope: InboundMessageEnvelope; contactId: string | null }): Promise<ReceiveInboundMessageResult> {
    return this.prisma.$transaction(async (transaction) => this.receiveInsideTransaction(transaction, input), { maxWait: 5_000, timeout: 30_000 });
  }

  private async receiveInsideTransaction(transaction: TransactionClient, input: { envelope: InboundMessageEnvelope; contactId: string | null }): Promise<ReceiveInboundMessageResult> {
    const { envelope } = input;
    const existing = await this.findDuplicate(transaction, envelope);
    if (existing) return { conversation: this.mapConversation(existing.conversation), message: this.mapInbound(existing), deduplicated: true };

    await this.lockParticipant(transaction, envelope);
    const duplicateAfterLock = await this.findDuplicate(transaction, envelope);
    if (duplicateAfterLock) return { conversation: this.mapConversation(duplicateAfterLock.conversation), message: this.mapInbound(duplicateAfterLock), deduplicated: true };

    const active = await transaction.conversation.findFirst({ where: { businessId: envelope.businessId, channel: envelope.channel, externalParticipant: envelope.sender, status: ConversationStatus.ACTIVE }, orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }] });
    const conversation = active
      ? await transaction.conversation.update({ where: { id: active.id }, data: { contactId: active.contactId ?? input.contactId, lastMessageAt: latestMessageAt(active.lastMessageAt, envelope.receivedAt) } })
      : await transaction.conversation.create({ data: { businessId: envelope.businessId, channel: envelope.channel, externalParticipant: envelope.sender, contactId: input.contactId, mode: ConversationMode.BOT, status: ConversationStatus.ACTIVE, lastMessageAt: envelope.receivedAt } });
    const message = await transaction.inboundMessage.create({ data: { businessId: envelope.businessId, conversationId: conversation.id, channel: envelope.channel, providerMessageId: envelope.providerMessageId, sender: envelope.sender, messageType: envelope.messageType, payload: envelope.payload, receivedAt: envelope.receivedAt } });

    await this.outbox.append(transaction, createIntegrationEvent({
      eventType: IntegrationEventType.MESSAGING_INBOUND_RECEIVED,
      businessId: envelope.businessId,
      aggregateType: 'CONVERSATION',
      aggregateId: conversation.id,
      payload: { inboundMessageId: message.id, conversationId: conversation.id, channel: envelope.channel, messageType: envelope.messageType },
    }));

    return { conversation: this.mapConversation(conversation), message: this.mapInbound(message), deduplicated: false };
  }

  private async findDuplicate(transaction: TransactionClient, envelope: InboundMessageEnvelope) {
    return transaction.inboundMessage.findUnique({ where: { businessId_channel_providerMessageId: { businessId: envelope.businessId, channel: envelope.channel, providerMessageId: envelope.providerMessageId } }, include: { conversation: true } });
  }

  private async lockParticipant(transaction: TransactionClient, envelope: InboundMessageEnvelope): Promise<void> {
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${envelope.businessId}|${envelope.channel}|${envelope.sender}`}, 0))`);
  }

  private mapConversation(row: { id: string; businessId: string; channel: string; externalParticipant: string; contactId: string | null; mode: string; status: string; createdAt: Date; lastMessageAt: Date; closedAt: Date | null }): Conversation {
    return Conversation.create({ id: row.id, businessId: row.businessId, channel: row.channel as MessagingChannel, externalParticipant: row.externalParticipant, contactId: row.contactId, mode: row.mode as ConversationMode, status: row.status as ConversationStatus, createdAt: row.createdAt, lastMessageAt: row.lastMessageAt, closedAt: row.closedAt });
  }

  private mapInbound(row: { id: string; businessId: string; conversationId: string; channel: string; providerMessageId: string; sender: string; messageType: string; payload: Prisma.JsonValue; receivedAt: Date; createdAt: Date }): InboundMessage {
    return InboundMessage.create({ id: row.id, businessId: row.businessId, conversationId: row.conversationId, channel: row.channel as MessagingChannel, providerMessageId: row.providerMessageId, sender: row.sender, messageType: row.messageType as InboundMessageType, payload: row.payload as InboundMessage['payload'], receivedAt: row.receivedAt, createdAt: row.createdAt });
  }
}

function latestMessageAt(previous: Date, receivedAt: Date): Date {
  return receivedAt > previous ? receivedAt : previous;
}
