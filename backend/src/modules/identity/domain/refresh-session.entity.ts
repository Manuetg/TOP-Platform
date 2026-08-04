export interface RefreshSessionProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class RefreshSession {
  private constructor(private readonly props: RefreshSessionProps) {}

  static create(props: RefreshSessionProps): RefreshSession {
    return new RefreshSession(props);
  }

  get id(): string { return this.props.id; }
  get userId(): string { return this.props.userId; }
  get tokenHash(): string { return this.props.tokenHash; }
  get expiresAt(): Date { return this.props.expiresAt; }
  get revokedAt(): Date | null { return this.props.revokedAt; }
  get replacedBySessionId(): string | null { return this.props.replacedBySessionId; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
