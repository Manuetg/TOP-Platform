import { Inject, Injectable } from '@nestjs/common';
import { MESSAGING_PROVIDER, type MessagingProvider } from './messaging-provider';
import { MessagingOutboundMessageNotFoundError } from './messaging.errors';
import { OUTBOUND_MESSAGE_REPOSITORY, type OutboundMessageRepository } from '../domain/outbound-message.repository';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';

@Injectable()
export class SendOutboundMessageUseCase {
  constructor(
    @Inject(OUTBOUND_MESSAGE_REPOSITORY) private readonly messages: OutboundMessageRepository,
    @Inject(MESSAGING_PROVIDER) private readonly provider: MessagingProvider,
  ) {}

  async execute(input: { id: string; businessId: string }): Promise<string> {
    const message = await this.messages.findByIdAndBusinessId(input.id, input.businessId);
    if (!message) throw new MessagingOutboundMessageNotFoundError('El mensaje saliente no existe.');
    if (message.status === OutboundMessageStatus.SENT) return message.providerMessageId ?? '';

    try {
      const result = await this.provider.send(message);
      const sent = await this.messages.markSent(message.id, input.businessId, result.providerMessageId, new Date());
      return sent?.providerMessageId ?? result.providerMessageId;
    } catch (error) {
      await this.messages.markFailed(message.id, input.businessId, new Date(), normalizeProviderError(error));
      throw error;
    }
  }
}

export function normalizeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'Unknown messaging provider error').slice(0, 2_000);
}
