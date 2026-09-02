import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
  type BusinessRepository,
} from '../../business/business.contract';
import { Resource } from '../domain/resource.entity';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import {
  InvalidBusinessIdError,
  InvalidResourceIdError,
  ResourceBusinessNotFoundError,
  ResourceNotFoundError,
} from './get-resource.use-case';
import { ResourceArchivedError, ResourceBusinessArchivedError } from './update-resource.use-case';

export interface ReactivateResourceInput {
  businessId: string;
  resourceId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ReactivateResourceUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
  ) {}

  async execute(input: ReactivateResourceInput): Promise<Resource> {
    this.validateIds(input);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ResourceBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new ResourceBusinessArchivedError('El negocio está archivado.');

    const resource = await this.resources.findByIdAndBusinessId(input.resourceId, input.businessId);
    if (!resource) throw new ResourceNotFoundError('El recurso no existe.');
    if (resource.status === ResourceStatus.ARCHIVED) throw new ResourceArchivedError('El recurso está archivado.');

    return resource.status === ResourceStatus.ACTIVE
      ? resource
      : this.resources.update(resource.reactivate());
  }

  private validateIds(input: ReactivateResourceInput): void {
    if (!uuid.test(input.businessId)) {
      throw new InvalidBusinessIdError('El identificador del negocio no es válido.');
    }
    if (!uuid.test(input.resourceId)) {
      throw new InvalidResourceIdError('El identificador del recurso no es válido.');
    }
  }
}
