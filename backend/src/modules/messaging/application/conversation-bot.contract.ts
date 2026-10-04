import type { IntegrationEvent } from '../../../shared/integration-events/integration-event';

export interface ConversationBotTransactionResult {
  handled: boolean;
  responseCreated: boolean;
}

export interface ConversationBotTransaction {
  process(input: { event: IntegrationEvent; businessName: string; businessTimeZone: string }): Promise<ConversationBotTransactionResult>;
}

export const CONVERSATION_BOT_TRANSACTION = Symbol('CONVERSATION_BOT_TRANSACTION');
