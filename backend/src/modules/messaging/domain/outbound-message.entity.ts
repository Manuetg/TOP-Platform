import { MessagingChannel } from './messaging-channel.enum';
import { OutboundMessageStatus } from './outbound-message-status.enum';
import { OutboundMessageType } from './outbound-message-type.enum';

export type OutboundMessagePayload = { [key: string]: string | number | boolean | null | OutboundMessagePayload | OutboundMessagePayload[] };

export interface OutboundMessageProps {
  id: string;
  businessId: string;
  integrationEventId: string;
  channel: MessagingChannel;
  recipient: string;
  messageType: OutboundMessageType;
  status: OutboundMessageStatus;
  payload: OutboundMessagePayload;
  providerMessageId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
}

export class OutboundMessage {
  private constructor(private readonly props: OutboundMessageProps) {}

  static create(props: OutboundMessageProps): OutboundMessage {
    return new OutboundMessage(props);
  }

  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get integrationEventId(): string { return this.props.integrationEventId; }
  get channel(): MessagingChannel { return this.props.channel; }
  get recipient(): string { return this.props.recipient; }
  get messageType(): OutboundMessageType { return this.props.messageType; }
  get status(): OutboundMessageStatus { return this.props.status; }
  get payload(): OutboundMessagePayload { return this.props.payload; }
  get providerMessageId(): string | null { return this.props.providerMessageId; }
  get createdAt(): Date { return this.props.createdAt; }
  get sentAt(): Date | null { return this.props.sentAt; }
  get failedAt(): Date | null { return this.props.failedAt; }
  get lastError(): string | null { return this.props.lastError; }
}
