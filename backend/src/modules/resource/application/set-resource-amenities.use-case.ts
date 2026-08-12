import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { AMENITY_REPOSITORY, type AmenityRepository } from '../domain/amenity.repository';
import { Resource } from '../domain/resource.entity';
import { RESOURCE_AMENITY_REPOSITORY, type ResourceAmenityRepository } from '../domain/resource-amenity.repository';
import { RESOURCE_REPOSITORY, type ResourceRepository } from '../domain/resource.repository';
import { ResourceStatus } from '../domain/resource-status.enum';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class InvalidResourceAmenitiesInputError extends Error {}
export class ResourceAmenitiesBusinessNotFoundError extends Error {}
export class ResourceAmenitiesBusinessArchivedError extends Error {}
export class ResourceAmenitiesNotFoundError extends Error {}
export class ResourceAmenitiesArchivedError extends Error {}
export class AmenitiesNotFoundError extends Error {}
export class InactiveAmenitiesError extends Error {}

export interface SetResourceAmenitiesInput { businessId: string; resourceId: string; amenityIds: string[]; }

@Injectable()
export class SetResourceAmenitiesUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resources: ResourceRepository,
    @Inject(AMENITY_REPOSITORY) private readonly amenities: AmenityRepository,
    @Inject(RESOURCE_AMENITY_REPOSITORY) private readonly resourceAmenities: ResourceAmenityRepository,
  ) {}

  async execute(input: SetResourceAmenitiesInput): Promise<Resource> {
    this.validateInput(input);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ResourceAmenitiesBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new ResourceAmenitiesBusinessArchivedError('El negocio está archivado.');
    const resource = await this.resources.findByIdAndBusinessId(input.resourceId, input.businessId);
    if (!resource) throw new ResourceAmenitiesNotFoundError('El recurso no existe.');
    if (resource.status === ResourceStatus.ARCHIVED) throw new ResourceAmenitiesArchivedError('El recurso está archivado.');
    if (input.amenityIds.length > 0) await this.validateAmenities(input.amenityIds);
    await this.resourceAmenities.replace(input.resourceId, input.amenityIds);
    const amenities = await this.resourceAmenities.listByResourceId(input.resourceId);
    return Resource.create({ id: resource.id, businessId: resource.businessId, name: resource.name, internalCode: resource.internalCode, description: resource.description, capacityMinimum: resource.capacityMinimum, capacityMaximum: resource.capacityMaximum, capacityMaximumChildren: resource.capacityMaximumChildren, status: resource.status, sortOrder: resource.sortOrder, createdAt: resource.createdAt, updatedAt: resource.updatedAt, amenities });
  }

  private validateInput(input: SetResourceAmenitiesInput): void {
    if (!uuid.test(input.businessId)) throw new InvalidResourceAmenitiesInputError('El identificador del negocio no es válido.');
    if (!uuid.test(input.resourceId)) throw new InvalidResourceAmenitiesInputError('El identificador del recurso no es válido.');
    if (!Array.isArray(input.amenityIds)) throw new InvalidResourceAmenitiesInputError('La lista de amenities es obligatoria.');
    if (input.amenityIds.some((id) => !uuid.test(id))) throw new InvalidResourceAmenitiesInputError('Los identificadores de amenities deben ser UUID válidos.');
    if (new Set(input.amenityIds).size !== input.amenityIds.length) throw new InvalidResourceAmenitiesInputError('La lista de amenities no puede contener duplicados.');
  }

  private async validateAmenities(ids: string[]): Promise<void> {
    const amenities = await this.amenities.findManyByIds(ids);
    if (amenities.length !== ids.length) throw new AmenitiesNotFoundError('Una o más amenities no existen.');
    if (amenities.some((amenity) => !amenity.active)) throw new InactiveAmenitiesError('Una o más amenities están inactivas.');
  }
}
