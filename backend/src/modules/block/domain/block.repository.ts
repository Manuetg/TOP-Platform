import { Block } from './block.entity';
import { BlockType } from './block-type.enum';

export const BLOCK_REPOSITORY = Symbol('BLOCK_REPOSITORY');
export interface CreateBlockData { businessId: string; resourceId: string; type: BlockType; reason: string; notes: string | null; startsAt: Date; endsAt: Date; }
export interface BlockListFilters { resourceId?: string; from?: Date; to?: Date; }
export interface BlockRepository { create(data: CreateBlockData): Promise<Block>; findByIdAndBusinessId(id: string, businessId: string): Promise<Block | null>; listByBusinessId(businessId: string, filters: BlockListFilters): Promise<Block[]>; update(block: Block): Promise<Block>; hasBlockingBlock(businessId:string,resourceId:string,from:Date,to:Date):Promise<boolean>; }
