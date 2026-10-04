import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BOOKING_REPOSITORY, type BookingRepository } from '../../booking/booking.contract';
import { CONTACT_LOOKUP, CONTACT_MESSAGING_LOOKUP, type ContactLookup, type ContactMessagingLookup } from '../../contact/contact.contract';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationStatus } from '../domain/conversation-status.enum';
import { CONVERSATION_INBOX_READER, type ConversationInboxDetail, type ConversationInboxMessage, type ConversationInboxReader, type ConversationInboxSummary, type InboxCursor } from '../domain/conversation-inbox.repository';
import { CONVERSATION_REPOSITORY, type ConversationRepository } from '../domain/conversation.repository';
import { OutboundMessage } from '../domain/outbound-message.entity';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';
import { OUTBOUND_MESSAGE_REPOSITORY, type OutboundMessageRepository } from '../domain/outbound-message.repository';
import { ConversationClosedError, ConversationNotFoundError, InvalidManualConversationMessageError, ManualConversationMessageNotAllowedError } from './receive-inbound-message.errors';
import { MessagingConversationConnectionMissingError } from './messaging.errors';
import { SendOutboundMessageUseCase } from './send-outbound-message.use-case';

export interface ConversationInboxPage<T> { items: T[]; pageInfo: { nextCursor: string | null; hasNextPage: boolean } }
export interface ConversationInboxSummaryView extends ConversationInboxSummary { contactName: string | null }
export interface ConversationInboxDetailView extends ConversationInboxDetail { contactName: string | null; contact: { id: string; name: string; phone: string | null; whatsapp: string | null } | null; booking: { id: string; status: string } | null }

@Injectable()
export class MessagingInboxUseCases {
  constructor(
    @Inject(CONVERSATION_INBOX_READER) private readonly reader: ConversationInboxReader,
    @Inject(CONTACT_MESSAGING_LOOKUP) private readonly messagingContacts: ContactMessagingLookup,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
  ) {}

  async listConversations(input: { businessId: unknown; cursor?: unknown; limit?: unknown }): Promise<ConversationInboxPage<ConversationInboxSummaryView>> {
    const businessId = uuid(input.businessId, 'El identificador del negocio no es válido.');
    const limit = parseLimit(input.limit); const before = decodeCursor(input.cursor, 'El cursor de conversaciones no es válido.');
    const rows = await this.reader.list({ businessId, before, limit: limit + 1 });
    const hasNextPage = rows.length > limit; const items = rows.slice(0, limit);
    const names = await this.contactNames(items.map((item) => item.contactId).filter((id): id is string => id !== null), businessId);
    return { items: items.map((item) => ({ ...item, contactName: item.contactId ? names.get(item.contactId) ?? null : null })), pageInfo: pageInfo(hasNextPage, items.at(-1)) };
  }

  async getConversation(input: { businessId: unknown; conversationId: unknown }): Promise<ConversationInboxDetailView> {
    const businessId = uuid(input.businessId, 'El identificador del negocio no es válido.'); const conversationId = uuid(input.conversationId, 'El identificador de la conversación no es válido.');
    const detail = await this.reader.findByIdAndBusinessId(conversationId, businessId); if (!detail) throw new ConversationNotFoundError('La conversación no existe.');
    const contact = detail.contactId ? await this.contacts.findByIdAndBusinessId(detail.contactId, businessId) : null;
    const booking = detail.bookingId ? await this.bookings.findByIdAndBusinessId(detail.bookingId, businessId) : null;
    return { ...detail, contactName: contact?.fullName ?? null, contact: contact ? { id: contact.id, name: contact.fullName, phone: contact.phone, whatsapp: contact.whatsapp } : null, booking: booking ? { id: booking.id, status: booking.status } : null };
  }

  async listMessages(input: { businessId: unknown; conversationId: unknown; cursor?: unknown; limit?: unknown }): Promise<ConversationInboxPage<ConversationInboxMessage>> {
    const businessId = uuid(input.businessId, 'El identificador del negocio no es válido.'); const conversationId = uuid(input.conversationId, 'El identificador de la conversación no es válido.');
    if (!(await this.reader.findByIdAndBusinessId(conversationId, businessId))) throw new ConversationNotFoundError('La conversación no existe.');
    const limit = parseLimit(input.limit); const after = decodeCursor(input.cursor, 'El cursor de mensajes no es válido.');
    const rows = await this.reader.listMessages({ businessId, conversationId, after, limit: limit + 1 }); const hasNextPage = rows.length > limit; const items = rows.slice(0, limit);
    return { items, pageInfo: pageInfo(hasNextPage, items.at(-1)) };
  }
  private async contactNames(ids: string[], businessId: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!this.messagingContacts.findSummariesByIdsAndBusinessId || ids.length === 0) return map;
    for (const contact of await this.messagingContacts.findSummariesByIdsAndBusinessId([...new Set(ids)], businessId)) map.set(contact.id, [contact.name, contact.lastName].filter((part): part is string => Boolean(part)).join(' '));
    return map;
  }
}

@Injectable()
export class SendManualConversationMessageUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversations: ConversationRepository,
    @Inject(OUTBOUND_MESSAGE_REPOSITORY) private readonly messages: OutboundMessageRepository,
    @Optional() private readonly send: SendOutboundMessageUseCase | undefined,
  ) {}

  async execute(input: { businessId: unknown; conversationId: unknown; text: unknown; clientRequestId: unknown }): Promise<OutboundMessage> {
    const businessId = uuid(input.businessId, 'El identificador del negocio no es válido.'); const conversationId = uuid(input.conversationId, 'El identificador de la conversación no es válido.');
    const text = requiredText(input.text); const clientRequestId = requiredClientRequestId(input.clientRequestId);
    const conversation = await this.conversations.findByIdAndBusinessId(conversationId, businessId); if (!conversation) throw new ConversationNotFoundError('La conversación no existe.');
    if (conversation.status === ConversationStatus.CLOSED) throw new ConversationClosedError('La conversación está cerrada.');
    if (conversation.mode !== ConversationMode.HUMAN) throw new ManualConversationMessageNotAllowedError('La conversación debe estar en modo HUMAN para enviar una respuesta manual.');
    if (!conversation.messagingConnectionId) throw new MessagingConversationConnectionMissingError('La conversación no tiene una conexión de Messaging asignada.');
    if (!this.send) throw new ManualConversationMessageNotAllowedError('El proveedor de Messaging no está configurado.');
    const message = await this.messages.createPending({ businessId, integrationEventId: randomUUID(), conversationId, messagingConnectionId: conversation.messagingConnectionId, manualClientRequestId: clientRequestId, channel: conversation.channel, recipient: conversation.externalParticipant, messageType: OutboundMessageType.MANUAL_REPLY, payload: { text } });
    await this.send.execute({ id: message.id, businessId });
    return (await this.messages.findByIdAndBusinessId(message.id, businessId)) ?? message;
  }
}

function requiredText(value: unknown): string { if (typeof value !== 'string') throw new InvalidManualConversationMessageError('El texto es obligatorio.'); const text = value.trim(); if (text.length === 0 || text.length > 4_000) throw new InvalidManualConversationMessageError('El texto debe tener entre 1 y 4000 caracteres.'); return text; }
function requiredClientRequestId(value: unknown): string { if (typeof value !== 'string') throw new InvalidManualConversationMessageError('clientRequestId es obligatorio.'); const id = value.trim(); if (id.length === 0 || id.length > 255) throw new InvalidManualConversationMessageError('clientRequestId no es válido.'); return id; }
function uuid(value: unknown, message: string): string { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InvalidManualConversationMessageError(message); return value; }
function parseLimit(value: unknown): number { if (value === undefined) return 50; const limit = typeof value === 'string' ? Number(value) : value; if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 50) throw new InvalidManualConversationMessageError('El límite debe ser un entero entre 1 y 50.'); return Number(limit); }
function decodeCursor(value: unknown, message: string): InboxCursor | null { if (value === undefined) return null; if (typeof value !== 'string' || value.length === 0) throw new InvalidManualConversationMessageError(message); try { const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { occurredAt?: unknown; id?: unknown }; if (typeof decoded.id !== 'string' || typeof decoded.occurredAt !== 'string') throw new Error(); const occurredAt = new Date(decoded.occurredAt); if (Number.isNaN(occurredAt.getTime())) throw new Error(); return { id: decoded.id, occurredAt }; } catch { throw new InvalidManualConversationMessageError(message); } }
function pageInfo<T extends { occurredAt?: Date; lastMessageAt?: Date; id?: string; conversationId?: string }>(hasNextPage: boolean, last: T | undefined): { nextCursor: string | null; hasNextPage: boolean } { if (!hasNextPage || !last) return { hasNextPage: false, nextCursor: null }; const occurredAt = last.occurredAt ?? last.lastMessageAt; const id = last.id ?? last.conversationId; if (!occurredAt || !id) return { hasNextPage: false, nextCursor: null }; return { hasNextPage: true, nextCursor: Buffer.from(JSON.stringify({ occurredAt: occurredAt.toISOString(), id }), 'utf8').toString('base64url') }; }
