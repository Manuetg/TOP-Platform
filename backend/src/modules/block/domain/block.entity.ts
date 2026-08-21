import { BlockStatus, EffectiveBlockStatus } from './block-status.enum';
import { BlockType } from './block-type.enum';

export interface BlockProps {
  id: string;
  businessId: string;
  resourceId: string;
  type: BlockType;
  reason: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BlockStatus;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Block {
  private constructor(private readonly props: BlockProps) {}

  static create(props: BlockProps): Block { return new Block(props); }
  cancel(reason: string, now = new Date()): Block {
    if (this.props.status === BlockStatus.CANCELLED) return this;
    if (this.effectiveStatus(now) === EffectiveBlockStatus.FINISHED) throw new Error('BLOCK_FINISHED');
    return Block.create({ ...this.props, status: BlockStatus.CANCELLED, cancellationReason: reason, cancelledAt: now, updatedAt: now });
  }
  effectiveStatus(now = new Date()): EffectiveBlockStatus {
    if (this.props.status === BlockStatus.CANCELLED) return EffectiveBlockStatus.CANCELLED;
    if (now < this.props.startsAt) return EffectiveBlockStatus.SCHEDULED;
    if (now >= this.props.endsAt) return EffectiveBlockStatus.FINISHED;
    return EffectiveBlockStatus.ACTIVE;
  }
  get id(): string { return this.props.id; }
  get businessId(): string { return this.props.businessId; }
  get resourceId(): string { return this.props.resourceId; }
  get type(): BlockType { return this.props.type; }
  get reason(): string { return this.props.reason; }
  get notes(): string | null { return this.props.notes; }
  get startsAt(): Date { return this.props.startsAt; }
  get endsAt(): Date { return this.props.endsAt; }
  get status(): BlockStatus { return this.props.status; }
  get cancellationReason(): string | null { return this.props.cancellationReason; }
  get cancelledAt(): Date | null { return this.props.cancelledAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
