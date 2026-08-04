import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { Resource } from '../domain/resource.entity';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';
import { InvalidBusinessIdError, ResourceBusinessNotFoundError } from './get-resource.use-case';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ListResourcesUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
  ) {}

  async execute(businessId: string): Promise<Resource[]> {
    if (!uuid.test(businessId)) throw new InvalidBusinessIdError('El identificador del negocio no es válido.');
    if (!await this.businesses.findById(businessId)) throw new ResourceBusinessNotFoundError('El negocio no existe.');
    return this.resources.listByBusinessId(businessId);
  }
}
