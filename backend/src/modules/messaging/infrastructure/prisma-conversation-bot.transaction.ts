import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { IntegrationEvent } from '../../../shared/integration-events/integration-event';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import type { ConversationBotTransaction, ConversationBotTransactionResult } from '../application/conversation-bot.contract';
import { decideConversationBotResponse } from '../application/conversation-bot.state-machine';
import { ConversationMode } from '../domain/conversation-mode.enum';
import { ConversationSessionState } from '../domain/conversation-session-state.enum';
import { TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY, type TransactionalOutboundMessageRepository } from '../domain/outbound-message.repository';
import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

@Injectable()
export class PrismaConversationBotTransaction implements ConversationBotTransaction {
  constructor(private readonly prisma: PrismaService, @Inject(TRANSACTIONAL_OUTBOUND_MESSAGE_REPOSITORY) private readonly messages: TransactionalOutboundMessageRepository) {}

  async process(input: { event: IntegrationEvent; businessName: string }): Promise<ConversationBotTransactionResult> {
    return this.prisma.$transaction((transaction) => this.processInsideTransaction(transaction, input), { maxWait: 5_000, timeout: 30_000 });
  }

  private async processInsideTransaction(transaction: TransactionClient, input: { event: IntegrationEvent; businessName: string }): Promise<ConversationBotTransactionResult> {
    const identifiers = this.identifiers(input.event);
    const conversation = await transaction.conversation.findFirst({ where: { id: identifiers.conversationId, businessId: input.event.businessId } });
    const inboundMessage = await transaction.inboundMessage.findFirst({ where: { id: identifiers.inboundMessageId, businessId: input.event.businessId, conversationId: identifiers.conversationId } });
    if (!conversation || !inboundMessage) throw new Error('El evento entrante no referencia una conversación válida.');

    const existing = await transaction.conversationBotEvent.findUnique({ where: { businessId_integrationEventId: { businessId: input.event.businessId, integrationEventId: input.event.eventId } } });
    if (existing) return { handled: false, responseCreated: false };

    const mode = conversation.mode as ConversationMode;
    if (mode === ConversationMode.HUMAN) {
      return this.processHumanConversation(transaction, input.event, identifiers);
    }

    return this.processBotConversation(transaction, input, identifiers, conversation, inboundMessage);
  }

  private async processHumanConversation(transaction: TransactionClient, event: IntegrationEvent, identifiers: { conversationId: string; inboundMessageId: string }): Promise<ConversationBotTransactionResult> {
    const marked = await this.markProcessed(transaction, event, identifiers);
    return marked ? { handled: true, responseCreated: false } : { handled: false, responseCreated: false };
  }

  private async processBotConversation(transaction: TransactionClient, input: { event: IntegrationEvent; businessName: string }, identifiers: { conversationId: string; inboundMessageId: string }, conversation: { id: string; businessId: string; channel: string; externalParticipant: string; mode: string }, inboundMessage: { payload: Prisma.JsonValue }): Promise<ConversationBotTransactionResult> {
    const session = await transaction.conversationSession.findUnique({ where: { conversationId_businessId: { conversationId: conversation.id, businessId: input.event.businessId } } });
    const state = (session?.state as ConversationSessionState | undefined) ?? ConversationSessionState.START;
    const text = this.inboundText(inboundMessage.payload);
    const decision = decideConversationBotResponse({ state, mode: conversation.mode as ConversationMode, text, businessName: input.businessName });

    const marked = await this.markProcessed(transaction, input.event, identifiers);
    if (!marked) return { handled: false, responseCreated: false };
    if (session) {
      await transaction.conversationSession.update({ where: { id: session.id }, data: { state: decision.nextState } });
    } else {
      await transaction.conversationSession.create({ data: { businessId: input.event.businessId, conversationId: conversation.id, state: decision.nextState, context: {} } });
    }

    if (decision.changeModeToHuman) {
      await transaction.conversation.update({ where: { id: conversation.id }, data: { mode: ConversationMode.HUMAN } });
    }

    if (!decision.response) return { handled: true, responseCreated: false };

    await this.messages.createPendingInTransaction(transaction, {
      businessId: input.event.businessId,
      integrationEventId: input.event.eventId,
      channel: conversation.channel as MessagingChannel,
      recipient: conversation.externalParticipant,
      messageType: OutboundMessageType.CONVERSATION_REPLY,
      payload: { text: decision.response },
    });
    return { handled: true, responseCreated: true };
  }

  private async markProcessed(transaction: TransactionClient, event: IntegrationEvent, identifiers: { conversationId: string; inboundMessageId: string }): Promise<boolean> {
    try {
      await transaction.conversationBotEvent.create({ data: { businessId: event.businessId, conversationId: identifiers.conversationId, inboundMessageId: identifiers.inboundMessageId, integrationEventId: event.eventId } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
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
