import { ConversationSessionState } from './conversation-session-state.enum';

export type ConversationSessionJsonValue = string | number | boolean | null | ConversationSessionJsonValue[] | { [key: string]: ConversationSessionJsonValue };
export type ConversationSessionContext = { [key: string]: ConversationSessionJsonValue };

export interface ConversationSessionProps {
  id: string;
  businessId: string;
  conversationId: string;
  state: ConversationSessionState;
  context: ConversationSessionContext;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export class ConversationSession {
  private constructor(private readonly props: ConversationSessionProps) {}

  static create(props: ConversationSessionProps): ConversationSession {
    return new ConversationSession(props);
  }

  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get conversationId(): string { return this.props.conversationId; }
  get state(): ConversationSessionState { return this.props.state; }
  get context(): ConversationSessionContext { return this.props.context; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
  get expiresAt(): Date | null { return this.props.expiresAt; }
}
