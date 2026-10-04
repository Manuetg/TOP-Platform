import { MessagingChannel } from './messaging-channel.enum';
import { InboundMessageType } from './inbound-message-type.enum';

export type InboundMessageJsonValue = string | number | boolean | null | InboundMessageJsonValue[] | { [key: string]: InboundMessageJsonValue };
export type InboundMessagePayload = { [key: string]: InboundMessageJsonValue };

export interface InboundMessageProps {
  id: string;
  businessId: string;
  conversationId: string;
  channel: MessagingChannel;
  providerMessageId: string;
  sender: string;
  messageType: InboundMessageType;
  payload: InboundMessagePayload;
  receivedAt: Date;
  createdAt: Date;
}

export class InboundMessage {
  private constructor(private readonly props: InboundMessageProps) {}

  static create(props: InboundMessageProps): InboundMessage { return new InboundMessage(props); }
  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get conversationId(): string { return this.props.conversationId; }
  get channel(): MessagingChannel { return this.props.channel; }
  get providerMessageId(): string { return this.props.providerMessageId; }
  get sender(): string { return this.props.sender; }
  get messageType(): InboundMessageType { return this.props.messageType; }
  get payload(): InboundMessagePayload { return this.props.payload; }
  get receivedAt(): Date { return this.props.receivedAt; }
  get createdAt(): Date { return this.props.createdAt; }
}
