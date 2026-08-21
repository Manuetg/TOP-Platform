import { Block } from '../../../src/modules/block/domain/block.entity';
import { BlockStatus } from '../../../src/modules/block/domain/block-status.enum';
import type { BlockListFilters, BlockRepository, CreateBlockData } from '../../../src/modules/block/domain/block.repository';

const blocks = new Map<string, Block>();
export const blockRepositoryFake: BlockRepository = {
  create: (data: CreateBlockData): Promise<Block> => { const id = `b0000000-0000-4000-8000-${String(blocks.size + 1).padStart(12, '0')}`; const block = Block.create({ id, ...data, status: BlockStatus.SCHEDULED, cancellationReason: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date() }); blocks.set(id, block); return Promise.resolve(block); },
  findByIdAndBusinessId: (id, businessId) => Promise.resolve(blocks.get(id)?.businessId === businessId ? blocks.get(id) ?? null : null),
  listByBusinessId: (businessId: string, filters: BlockListFilters) => Promise.resolve([...blocks.values()].filter((block) => block.businessId === businessId && (filters.resourceId === undefined || block.resourceId === filters.resourceId) && (filters.from === undefined || block.endsAt > filters.from) && (filters.to === undefined || block.startsAt < filters.to)).sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.endsAt.getTime() - right.endsAt.getTime() || left.id.localeCompare(right.id))),
  update: (block) => { blocks.set(block.id, block); return Promise.resolve(block); },
};
export function resetBlockRepositoryFake(): void { blocks.clear(); }
