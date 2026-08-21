import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { BLOCK_REPOSITORY, type BlockRepository } from '../domain/block.repository';
import { Block } from '../domain/block.entity';
import { BlockBusinessNotFoundError, BlockBusinessUnavailableError, BlockFinishedError, BlockNotFoundError } from './block.errors';
import { text, uuid } from './block.validation';

export interface CancelBlockInput { businessId: string; blockId: string; reason: unknown; }
@Injectable()
export class CancelBlockUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepository) {}
  async execute(input: CancelBlockInput): Promise<Block> {
    uuid(input.businessId, 'El identificador del negocio no es válido.');
    uuid(input.blockId, 'El identificador del bloqueo no es válido.');
    const reason = text(input.reason, 'El motivo de cancelación', 2, 500) as string;
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new BlockBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new BlockBusinessUnavailableError('El negocio no está activo.');
    const block = await this.blocks.findByIdAndBusinessId(input.blockId, input.businessId);
    if (!block) throw new BlockNotFoundError('El bloqueo no existe.');
    try {
      const cancelled = block.cancel(reason);
      return cancelled === block ? block : await this.blocks.update(cancelled);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'BLOCK_FINISHED') throw new BlockFinishedError('El bloqueo finalizado no puede cancelarse.');
      throw error;
    }
  }
}
