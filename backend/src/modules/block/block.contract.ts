export interface BlockingBlock {
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
}

export const BLOCK_AVAILABILITY_LOOKUP = Symbol('BLOCK_AVAILABILITY_LOOKUP');

export interface BlockAvailabilityLookup {
  hasBlockingBlock(
    businessId: string,
    resourceId: string,
    from: Date,
    to: Date,
  ): Promise<boolean>;
  listBlockingBlocks(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<BlockingBlock[]>;
}
