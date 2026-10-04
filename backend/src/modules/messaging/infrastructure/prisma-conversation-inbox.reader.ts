import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { ConversationInboxDetail, ConversationInboxMessage, ConversationInboxReader, ConversationInboxSummary, InboxCursor } from '../domain/conversation-inbox.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';

@Injectable()
export class PrismaConversationInboxReader implements ConversationInboxReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: { businessId: string; before: InboxCursor | null; limit: number }): Promise<ConversationInboxSummary[]> {
    const where = { businessId: input.businessId, ...(input.before ? { OR: [{ lastMessageAt: { lt: input.before.occurredAt } }, { lastMessageAt: input.before.occurredAt, id: { lt: input.before.id } }] } : {}) };
    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: {
        id: true, businessId: true, channel: true, externalParticipant: true, contactId: true, mode: true, status: true, lastMessageAt: true,
        inboundMessages: { orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, payload: true, receivedAt: true } },
        outboundMessages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, payload: true, createdAt: true } },
      },
    });
    return rows.map((row) => this.summary(row));
  }

  async findByIdAndBusinessId(id: string, businessId: string): Promise<ConversationInboxDetail | null> {
    const row = await this.prisma.conversation.findFirst({
      where: { id, businessId },
      select: {
        id: true, businessId: true, channel: true, externalParticipant: true, contactId: true, mode: true, status: true, createdAt: true, lastMessageAt: true, closedAt: true,
        session: { select: { context: true } },
        inboundMessages: { orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, payload: true, receivedAt: true } },
        outboundMessages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { id: true, payload: true, createdAt: true } },
      },
    });
    if (!row) return null;
    return { ...this.summary(row), createdAt: row.createdAt, closedAt: row.closedAt, bookingId: bookingIdFromContext(row.session?.context) };
  }

  async listMessages(input: { conversationId: string; businessId: string; after: InboxCursor | null; limit: number }): Promise<ConversationInboxMessage[]> {
    const after = input.after;
    const inbound = await this.prisma.inboundMessage.findMany({
      where: { conversationId: input.conversationId, businessId: input.businessId, ...(after ? { OR: [{ receivedAt: { gt: after.occurredAt } }, { receivedAt: after.occurredAt, id: { gt: after.id } }] } : {}) },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }], take: input.limit, select: { id: true, messageType: true, payload: true, receivedAt: true },
    });
    const outbound = await this.prisma.outboundMessage.findMany({
      where: { conversationId: input.conversationId, businessId: input.businessId, ...(after ? { OR: [{ createdAt: { gt: after.occurredAt } }, { createdAt: after.occurredAt, id: { gt: after.id } }] } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: input.limit, select: { id: true, messageType: true, status: true, payload: true, createdAt: true },
    });
    return [...inbound.map((row) => ({ id: row.id, direction: 'INBOUND' as const, messageType: row.messageType, text: textFromPayload(row.payload), occurredAt: row.receivedAt, status: null, origin: null })), ...outbound.map((row) => ({ id: row.id, direction: 'OUTBOUND' as const, messageType: 'TEXT', text: textFromPayload(row.payload), occurredAt: row.createdAt, status: row.status as OutboundMessageStatus, origin: outboundOrigin(row.messageType) }))]
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id))
      .slice(0, input.limit);
  }

  private summary(row: { id: string; businessId: string; channel: string; externalParticipant: string; contactId: string | null; mode: string; status: string; lastMessageAt: Date; inboundMessages: { payload: unknown; receivedAt: Date }[]; outboundMessages: { payload: unknown; createdAt: Date }[] }): ConversationInboxSummary {
    const inbound = row.inboundMessages[0]; const outbound = row.outboundMessages[0];
    const latest = inbound && outbound ? (inbound.receivedAt >= outbound.createdAt ? { direction: 'INBOUND' as const, payload: inbound.payload } : { direction: 'OUTBOUND' as const, payload: outbound.payload }) : inbound ? { direction: 'INBOUND' as const, payload: inbound.payload } : outbound ? { direction: 'OUTBOUND' as const, payload: outbound.payload } : null;
    return { conversationId: row.id, businessId: row.businessId, channel: row.channel as MessagingChannel, mode: row.mode as ConversationMode, status: row.status as ConversationStatus, externalParticipant: row.externalParticipant, contactId: row.contactId, lastMessageAt: row.lastMessageAt, lastMessagePreview: latest ? textFromPayload(latest.payload) : null, lastMessageDirection: latest?.direction ?? null };
  }
}

function textFromPayload(payload: unknown): string | null { if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null; const text = (payload as { text?: unknown }).text; return typeof text === 'string' ? text : null; }
function outboundOrigin(type: string): 'BOT' | 'AUTOMATION' | 'MANUAL' { if (type === 'CONVERSATION_REPLY') return 'BOT'; if (type === 'MANUAL_REPLY') return 'MANUAL'; return 'AUTOMATION'; }
function bookingIdFromContext(context: unknown): string | null { if (!context || typeof context !== 'object' || Array.isArray(context)) return null; const booking = (context as { booking?: unknown }).booking; if (!booking || typeof booking !== 'object' || Array.isArray(booking)) return null; const id = (booking as { bookingId?: unknown }).bookingId; return typeof id === 'string' ? id : null; }
