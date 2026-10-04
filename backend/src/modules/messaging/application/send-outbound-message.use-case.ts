import { Inject, Injectable, Optional } from '@nestjs/common';
import { MESSAGING_PROVIDER, type MessagingProvider } from './messaging-provider';
import { MessagingOutboundMessageNotFoundError, MessagingOutboundConnectionNotConfiguredError, MessagingProviderMismatchError } from './messaging.errors';
import { OUTBOUND_MESSAGE_REPOSITORY, type OutboundMessageRepository } from '../domain/outbound-message.repository';
import { OutboundMessageStatus } from '../domain/outbound-message-status.enum';
import { MESSAGING_OUTBOUND_CONNECTION_RESOLVER, type MessagingOutboundConnectionResolver } from '../domain/messaging-connection.repository';

@Injectable()
export class SendOutboundMessageUseCase {
  constructor(
    @Inject(OUTBOUND_MESSAGE_REPOSITORY) private readonly messages: OutboundMessageRepository,
    @Inject(MESSAGING_PROVIDER) private readonly provider: MessagingProvider,
    @Optional() @Inject(MESSAGING_OUTBOUND_CONNECTION_RESOLVER) private readonly connections?: MessagingOutboundConnectionResolver,
  ) {}

  async execute(input: { id: string; businessId: string }): Promise<string> {
    const message = await this.messages.findByIdAndBusinessId(input.id, input.businessId);
    if (!message) throw new MessagingOutboundMessageNotFoundError('El mensaje saliente no existe.');
    if ([OutboundMessageStatus.SENT, OutboundMessageStatus.DELIVERED, OutboundMessageStatus.READ].includes(message.status)) return message.providerMessageId ?? '';

    const connection = await this.resolveConnection(message, input.businessId);

    try {
      const result = await this.provider.send(message, connection);
      const sent = await this.messages.markSent(message.id, input.businessId, result.providerMessageId, new Date());
      return sent?.providerMessageId ?? result.providerMessageId;
    } catch (error) {
      await this.messages.markFailed(message.id, input.businessId, new Date(), normalizeProviderError(error));
      throw error;
    }
  }

  private async resolveConnection(message: NonNullable<Awaited<ReturnType<OutboundMessageRepository['findByIdAndBusinessId']>>>, businessId: string) {
    if (!this.connections) return undefined;
    if (!message.messagingConnectionId) throw new MessagingOutboundConnectionNotConfiguredError('El mensaje saliente no tiene una conexión activa válida.');
    const connection = await this.connections.resolveActiveConnectionById({ connectionId: message.messagingConnectionId, businessId });
    if (!connection) throw new MessagingOutboundConnectionNotConfiguredError('El mensaje saliente no tiene una conexión activa válida.');
    if (connection.businessId !== message.businessId || (this.provider.supports && !this.provider.supports(connection.provider))) throw new MessagingProviderMismatchError('El provider no es compatible con la conexión seleccionada.');
    return connection;
  }
}

export function normalizeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || 'Unknown messaging provider error').slice(0, 2_000);
}
