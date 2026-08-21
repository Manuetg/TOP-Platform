import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { RESOURCE_REPOSITORY, ResourceStatus, type ResourceRepository } from '../../resource/resource.contract';
import { BLOCK_REPOSITORY, type BlockRepository } from '../domain/block.repository';
import { Block } from '../domain/block.entity';
import { BlockBusinessNotFoundError, BlockBusinessUnavailableError, BlockResourceNotFoundError, BlockResourceUnavailableError, InvalidBlockInputError } from './block.errors';
import { blockType, dateTime, text, uuid } from './block.validation';

export interface CreateBlockInput { businessId: string; resourceId: string; type: unknown; reason: unknown; notes?: unknown; startsAt: unknown; endsAt: unknown; }
@Injectable()
export class CreateBlockUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository, @Inject(BLOCK_REPOSITORY) private readonly blocks: BlockRepository) {}
  async execute(input: CreateBlockInput): Promise<Block> {
    uuid(input.businessId, 'El identificador del negocio no es válido.');
    uuid(input.resourceId, 'El identificador del Resource no es válido.');
    const startsAt = dateTime(input.startsAt, 'El inicio');
    const endsAt = dateTime(input.endsAt, 'El fin');
    if (endsAt <= startsAt) throw new InvalidBlockInputError('El fin debe ser posterior al inicio.');
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new BlockBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new BlockBusinessUnavailableError('El negocio no está activo.');
    const resource = await this.resources.findByIdAndBusinessId(input.resourceId, input.businessId);
    if (!resource) throw new BlockResourceNotFoundError('El Resource no existe.');
    if (resource.status === ResourceStatus.ARCHIVED) throw new BlockResourceUnavailableError('El Resource está archivado.');
    return this.blocks.create({ businessId: input.businessId, resourceId: input.resourceId, type: blockType(input.type), reason: text(input.reason, 'El motivo', 2, 120) as string, notes: text(input.notes, 'La observación', 0, 500, true), startsAt, endsAt });
  }
}
