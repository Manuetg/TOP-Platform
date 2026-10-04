import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AVAILABILITY_QUERY, type AvailabilityQuery } from '../../availability/availability.contract';
import { PRICING_QUOTE, type PricingQuote, type PricingQuoteResult } from '../../pricing/pricing.contract';
import { BOOKING_PENDING_CREATION, type BookingPendingCreation } from '../../booking/booking.contract';
import { CONTACT_LOOKUP, CONTACT_MESSAGING_RESOLUTION, type ContactLookup, type ContactMessagingResolution } from '../../contact/contact.contract';
import type { IntegrationEvent } from '../../../shared/integration-events/integration-event';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { ConversationBotTransaction, ConversationBotTransactionResult } from '../application/conversation-bot.contract';
import { readConversationBotContext } from '../application/conversation-bot-context';
import { currentBusinessDate } from '../application/conversation-bot-date';
import { decideConversationBotResponse, type ConversationBotDecision, type PricingQuoteOption } from '../application/conversation-bot.state-machine';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY, type TransactionalOutboundMessageRepository } from '../domain/outbound-message.repository';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Preparation = {
  conversation: { id: string; businessId: string; channel: string; externalParticipant: string; mode: string };
  inboundMessage: { payload: Prisma.JsonValue };
  session: { id: string; state: string; context: Prisma.JsonValue; updatedAt: Date } | null;
  contact: { id: string; name: string; lastName: string | null } | null;
};

@Injectable()
export class PrismaConversationBotTransaction implements ConversationBotTransaction {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY) private readonly messages: TransactionalOutboundMessageRepository,
    @Inject(AVAILABILITY_QUERY) private readonly availability: AvailabilityQuery,
    @Inject(PRICING_QUOTE) private readonly pricing: PricingQuote,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup = { findByIdAndBusinessId: () => Promise.resolve(null) },
    @Inject(CONTACT_MESSAGING_RESOLUTION) private readonly contactResolution: ContactMessagingResolution = { resolveOrCreateInTransaction: () => Promise.reject(new Error('Contact resolution is not configured.')) },
    @Inject(BOOKING_PENDING_CREATION) private readonly bookingCreation: BookingPendingCreation = { createPendingInTransaction: () => Promise.reject(new Error('Booking creation is not configured.')) },
  ) {}

  // La decisión puede requerir varias consultas externas, pero nunca abre una transacción durante esas consultas.
  // eslint-disable-next-line complexity
  async process(input: { event: IntegrationEvent; businessName: string; businessTimeZone: string }): Promise<ConversationBotTransactionResult> {
    const preparation = await this.prepare(input.event);
    if (!preparation) return { handled: false, responseCreated: false };

    const state = (preparation.session?.state as ConversationSessionState | undefined) ?? ConversationSessionState.START;
    const context = readConversationBotContext(preparation.session?.context);
    const mode = preparation.conversation.mode as ConversationMode;
    const baseInput = {
      state,
      mode,
      text: this.inboundText(preparation.inboundMessage.payload),
      businessName: input.businessName,
      businessToday: currentBusinessDate(input.businessTimeZone),
      context,
      ...(preparation.contact ? { contact: { contactId: preparation.contact.id, name: fullName(preparation.contact.name, preparation.contact.lastName) } } : {}),
    };
    let decision = decideConversationBotResponse(baseInput);

    if (decision.availabilityRequest) {
      const options = await this.findAvailability(input.event.businessId, decision.availabilityRequest);
      decision = decideConversationBotResponse({ ...baseInput, context: decision.context, availabilityOptions: options });
    }

    if (decision.availabilitySelectionRequest) {
      const request = decision.availabilitySelectionRequest;
      const options = await this.findAvailability(input.event.businessId, request);
      const selected = options.find((option) => option.resourceId === request.resourceId);
      if (!selected) {
        decision = decideConversationBotResponse({ ...baseInput, context: decision.context, availabilityOptions: options, availabilitySelectionUnavailable: true });
      } else {
        const quote = await this.pricing.quote({ businessId: input.event.businessId, resourceId: selected.resourceId, checkIn: request.checkIn, checkOut: request.checkOut });
        decision = decideConversationBotResponse({ ...baseInput, context: decision.context, pricingQuote: quote ? this.pricingQuoteOption(quote, selected.name, request) : undefined, pricingUnavailable: quote === null });
      }
    }

    if (decision.availabilityRefreshRequest) {
      const options = await this.findAvailability(input.event.businessId, decision.availabilityRefreshRequest);
      decision = decideConversationBotResponse({ ...baseInput, context: decision.context, availabilityOptions: options, availabilityRefreshed: true });
    }

    if (decision.bookingConfirmationRequest) {
      const request = decision.bookingConfirmationRequest;
      const options = await this.findAvailability(input.event.businessId, request);
      const selected = options.some((option) => option.resourceId === request.resourceId);
      const result = selected
        ? await this.pricing.quote({ businessId: input.event.businessId, resourceId: request.resourceId, checkIn: request.checkIn, checkOut: request.checkOut })
        : null;
      decision = decideConversationBotResponse({ ...baseInput, context: decision.context, bookingConfirmationResult: { availabilityAvailable: selected, ...(selected && result ? { pricingQuote: this.pricingQuoteOption(result, options.find((option) => option.resourceId === request.resourceId)!.name, request) } : {}), ...(selected && !result ? { pricingUnavailable: true } : {}) } });
    }

    return this.persist(input.event, preparation, decision);
  }

  private async findAvailability(businessId: string, request: { checkIn: string; checkOut: string; guests: number }) {
    return this.availability.findAvailableResources({ businessId, from: request.checkIn, to: request.checkOut, guests: request.guests });
  }

  private pricingQuoteOption(quote: PricingQuoteResult, resourceName: string, request: { resourceId: string; checkIn: string; checkOut: string; guests: number }): PricingQuoteOption {
    return { resourceId: quote.resourceId, resourceName, checkIn: quote.checkIn, checkOut: quote.checkOut, guests: request.guests, ratePlanId: quote.ratePlanId, ratePlanName: quote.ratePlanName, currency: quote.currency, nights: quote.nights, totalAmountMinor: quote.totalAmountMinor };
  }

  private async prepare(event: IntegrationEvent): Promise<Preparation | null> {
    const identifiers = this.identifiers(event);
    const processed = await this.prisma.conversationBotEvent.findUnique({ where: { businessId_integrationEventId: { businessId: event.businessId, integrationEventId: event.eventId } } });
    if (processed) return null;

    const conversation = await this.prisma.conversation.findFirst({ where: { id: identifiers.conversationId, businessId: event.businessId } });
    const inboundMessage = await this.prisma.inboundMessage.findFirst({ where: { id: identifiers.inboundMessageId, businessId: event.businessId, conversationId: identifiers.conversationId } });
    if (!conversation || !inboundMessage) throw new Error('El evento entrante no referencia una conversación válida.');
    const session = await this.prisma.conversationSession.findUnique({ where: { conversationId_businessId: { conversationId: conversation.id, businessId: event.businessId } } });
    const contact = conversation.contactId ? await this.contacts.findByIdAndBusinessId(conversation.contactId, event.businessId) : null;
    return { conversation, inboundMessage, session, contact: contact ? { id: contact.id, name: contact.name, lastName: contact.lastName } : null };
  }

  private async persist(event: IntegrationEvent, preparation: Preparation, decision: ConversationBotDecision): Promise<ConversationBotTransactionResult> {
    return this.prisma.$transaction((transaction) => this.persistInsideTransaction(transaction, event, preparation, decision), { maxWait: 5_000, timeout: 30_000 });
  }

  private async persistInsideTransaction(transaction: TransactionClient, event: IntegrationEvent, preparation: Preparation, decision: ConversationBotDecision): Promise<ConversationBotTransactionResult> {
    const identifiers = this.identifiers(event);
    const existing = await transaction.conversationBotEvent.findUnique({ where: { businessId_integrationEventId: { businessId: event.businessId, integrationEventId: event.eventId } } });
    if (existing) return { handled: false, responseCreated: false };

    const conversation = await transaction.conversation.findFirst({ where: { id: identifiers.conversationId, businessId: event.businessId } });
    if (!conversation) throw new Error('La conversación del evento no existe.');
    const marked = await this.markProcessed(transaction, event, identifiers);
    if (!marked) return { handled: false, responseCreated: false };

    const currentMode = conversation.mode as ConversationMode;
    if (currentMode === ConversationMode.HUMAN) return { handled: true, responseCreated: false };

    const session = await transaction.conversationSession.findUnique({ where: { conversationId_businessId: { conversationId: conversation.id, businessId: event.businessId } } });
    this.assertPreparedSession(session, preparation.session);
    let finalDecision = decision;
    if (decision.bookingCreationRequest) {
      const request = decision.bookingCreationRequest;
      const contact = await this.contactResolution.resolveOrCreateInTransaction({ businessId: event.businessId, address: conversation.externalParticipant, name: request.contactName, existingContactId: request.contactId, transaction });
      const booking = await this.bookingCreation.createPendingInTransaction({ businessId: event.businessId, contactId: contact.id, resourceId: request.resourceId, checkInDate: request.checkIn, checkOutDate: request.checkOut, guests: request.guests, actorUserId: null, transaction });
      await transaction.conversation.updateMany({ where: { id: conversation.id, businessId: event.businessId }, data: { contactId: contact.id } });
      finalDecision = { nextState: ConversationSessionState.BOOKING_CREATED, response: 'Tu solicitud de reserva fue registrada correctamente. El alojamiento revisará la solicitud y te confirmará el estado.', changeModeToHuman: false, context: { booking: { bookingId: booking.id, status: 'PENDING' } } };
    }
    await this.persistSession(transaction, event.businessId, conversation.id, session, preparation.session, finalDecision);

    if (decision.changeModeToHuman) {
      await transaction.conversation.updateMany({ where: { id: conversation.id, businessId: event.businessId }, data: { mode: ConversationMode.HUMAN } });
    }

    if (!finalDecision.response) return { handled: true, responseCreated: false };
    await this.messages.createPendingInTransaction(transaction, {
      businessId: event.businessId,
      integrationEventId: event.eventId,
      channel: conversation.channel as MessagingChannel,
      recipient: conversation.externalParticipant,
      messageType: OutboundMessageType.CONVERSATION_REPLY,
      payload: { text: finalDecision.response },
    });
    return { handled: true, responseCreated: true };
  }

  private async persistSession(transaction: TransactionClient, businessId: string, conversationId: string, session: { id: string; updatedAt: Date } | null, prepared: Preparation['session'], decision: ConversationBotDecision): Promise<void> {
    if (!session) {
      await transaction.conversationSession.create({ data: { businessId, conversationId, state: decision.nextState, context: decision.context as Prisma.InputJsonObject } });
      return;
    }
    const updated = await transaction.conversationSession.updateMany({ where: { id: session.id, businessId, updatedAt: prepared?.updatedAt }, data: { state: decision.nextState, context: decision.context as Prisma.InputJsonObject } });
    if (updated.count !== 1) throw new Error('La sesión de conversación cambió mientras se persistía la respuesta.');
  }

  private assertPreparedSession(current: { id: string; updatedAt: Date } | null, prepared: Preparation['session']): void {
    if (current === null && prepared === null) return;
    if (current && prepared && current.id === prepared.id && current.updatedAt.getTime() === prepared.updatedAt.getTime()) return;
    throw new Error('La sesión de conversación cambió mientras se consultaba disponibilidad.');
  }

  private async markProcessed(transaction: TransactionClient, event: IntegrationEvent, identifiers: { conversationId: string; inboundMessageId: string }): Promise<boolean> {
    const result = await transaction.conversationBotEvent.createMany({
      data: { businessId: event.businessId, conversationId: identifiers.conversationId, inboundMessageId: identifiers.inboundMessageId, integrationEventId: event.eventId },
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  private identifiers(event: IntegrationEvent): { conversationId: string; inboundMessageId: string } {
    const conversationId = event.payload.conversationId;
    const inboundMessageId = event.payload.inboundMessageId;
    if (typeof conversationId !== 'string' || typeof inboundMessageId !== 'string' || !conversationId || !inboundMessageId) throw new Error('El evento entrante no contiene identificadores válidos.');
    return { conversationId, inboundMessageId };
  }

  private inboundText(payload: Prisma.JsonValue): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.text !== 'string') throw new Error('El mensaje entrante no contiene texto.');
    return payload.text;
  }
}

function fullName(name: string, lastName: string | null): string {
  return lastName ? `${name} ${lastName}` : name;
}
