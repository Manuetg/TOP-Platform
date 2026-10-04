import { Inject, Injectable, Logger } from '@nestjs/common';
import { MESSAGING_CONNECTION_RESOLVER, type MessagingConnectionResolver } from '../domain/messaging-connection.repository';
import { InboundMessageType } from '../domain/inbound-message-type.enum';
import { OUTBOUND_MESSAGE_REPOSITORY, type OutboundMessageRepository } from '../domain/outbound-message.repository';
import type { MessagingWebhookEvent } from './messaging-webhook.contract';
import { ReceiveInboundMessageUseCase } from './receive-inbound-message.use-case';

@Injectable()
export class ProcessMessagingWebhookUseCase {
  private readonly logger = new Logger(ProcessMessagingWebhookUseCase.name);

  constructor(
    @Inject(MESSAGING_CONNECTION_RESOLVER) private readonly connections: MessagingConnectionResolver,
    private readonly receiveInbound: ReceiveInboundMessageUseCase,
    @Inject(OUTBOUND_MESSAGE_REPOSITORY) private readonly outbound: OutboundMessageRepository,
  ) {}

  async execute(events: readonly MessagingWebhookEvent[]): Promise<void> {
    for (const event of events) {
      const connection = await this.connections.resolveActiveConnection({ provider: event.provider, channel: event.channel, providerPhoneNumberId: event.providerPhoneNumberId });
      if (!connection) {
        this.logger.warn(`Webhook ignorado: conexión activa no encontrada (${event.provider}/${event.channel}/${event.providerPhoneNumberId}).`);
        continue;
      }
      if (event.kind === 'INBOUND_TEXT') {
        await this.receiveInbound.execute({ businessId: connection.businessId, channel: event.channel, providerMessageId: event.providerMessageId, sender: toE164(event.sender), messageType: InboundMessageType.TEXT, payload: { text: event.text }, receivedAt: event.occurredAt });
      } else {
        const updated = await this.outbound.applyDeliveryStatus({ businessId: connection.businessId, providerMessageId: event.providerMessageId, status: event.status, providerStatusAt: event.occurredAt, lastError: event.lastError });
        if (!updated) this.logger.warn(`Webhook ignorado: OutboundMessage no encontrado (${event.providerMessageId}).`);
      }
    }
  }
}

function toE164(sender: string): string {
  return sender.startsWith('+') ? sender : `+${sender}`;
}
