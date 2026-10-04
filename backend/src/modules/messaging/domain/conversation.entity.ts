import { MessagingChannel } from './messaging-channel.enum';
import { ConversationMode } from './conversation-mode.enum';
import { ConversationStatus } from './conversation-status.enum';

export interface ConversationProps {
  id: string;
  businessId: string;
  channel: MessagingChannel;
  externalParticipant: string;
  messagingConnectionId?: string | null;
  contactId: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  createdAt: Date;
  lastMessageAt: Date;
  closedAt: Date | null;
}

export class Conversation {
  private constructor(private readonly props: ConversationProps) {}

  static create(props: ConversationProps): Conversation { return new Conversation(props); }
  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get channel(): MessagingChannel { return this.props.channel; }
  get externalParticipant(): string { return this.props.externalParticipant; }
  get messagingConnectionId(): string | null { return this.props.messagingConnectionId ?? null; }
  get contactId(): string | null { return this.props.contactId; }
  get mode(): ConversationMode { return this.props.mode; }
  get status(): ConversationStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get lastMessageAt(): Date { return this.props.lastMessageAt; }
  get closedAt(): Date | null { return this.props.closedAt; }
}
