export type BlockType =
  | "MAINTENANCE"
  | "OWNER_USE"
  | "OTHER";

export type BlockStatus =
  | "SCHEDULED"
  | "CANCELLED";

export type EffectiveBlockStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "FINISHED"
  | "CANCELLED";

export interface Block {
  id: string;
  businessId: string;
  resourceId: string;
  type: BlockType;
  reason: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  status: BlockStatus;
  effectiveStatus: EffectiveBlockStatus;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListBlocksInput {
  resourceId?: string;
  from?: string;
  to?: string;
}
export interface CreateBlockInput {
  resourceId: string;
  type: BlockType;
  reason: string;
  notes?: string | null;
  startsAt: string;
  endsAt: string;
}