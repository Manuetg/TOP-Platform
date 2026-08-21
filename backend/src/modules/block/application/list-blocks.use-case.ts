import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { BLOCK_REPOSITORY, type BlockListFilters, type BlockRepository } from '../domain/block.repository';
import { Block } from '../domain/block.entity';
import { BlockBusinessNotFoundError, InvalidBlockInputError } from './block.errors';
import { dateTime, uuid } from './block.validation';

export interface ListBlocksInput { businessId: string; resourceId?: string; from?: unknown; to?: unknown; }
@Injectable()
export class ListBlocksUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepository) {}
  async execute(input: ListBlocksInput): Promise<Block[]> {
    uuid(input.businessId, 'El identificador del negocio no es válido.');
    if (input.resourceId !== undefined) uuid(input.resourceId, 'El identificador del Resource no es válido.');
    const filters: BlockListFilters = { resourceId: input.resourceId, from: input.from === undefined ? undefined : dateTime(input.from, 'El inicio'), to: input.to === undefined ? undefined : dateTime(input.to, 'El fin') };
    if (filters.from && filters.to && filters.to <= filters.from) throw new InvalidBlockInputError('El fin debe ser posterior al inicio.');
    if (!(await this.businesses.findById(input.businessId))) throw new BlockBusinessNotFoundError('El negocio no existe.');
    return this.blocks.listByBusinessId(input.businessId, filters);
  }
}
