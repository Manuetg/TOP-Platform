import { MessagingChannel } from '../domain/messaging-channel.enum';
import { OutboundMessagePayload } from '../domain/outbound-message.entity';
import { OutboundMessageType } from '../domain/outbound-message-type.enum';

export interface MessageIntent {
  businessId: string;
  integrationEventId: string;
  channel: MessagingChannel;
  recipient: string;
  messageType: OutboundMessageType;
  payload: OutboundMessagePayload;
}
