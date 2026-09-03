import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { Amenity, type AmenityCategory } from '../domain/amenity.entity';
import { BUSINESS_AMENITY_REPOSITORY, type BusinessAmenityRepository } from '../domain/business-amenity.repository';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = new Set<AmenityCategory>(['CONNECTIVITY', 'CLIMATE', 'BATHROOM', 'KITCHEN', 'ENTERTAINMENT', 'OUTDOOR', 'PARKING', 'SERVICES', 'ACCESSIBILITY', 'GENERAL']);

export class InvalidBusinessAmenityInputError extends Error {}
export class BusinessAmenityBusinessNotFoundError extends Error {}
export class BusinessAmenityBusinessArchivedError extends Error {}

export interface CreateBusinessAmenityInput { businessId: string; name: unknown; category: unknown; }

@Injectable()
export class CreateBusinessAmenityUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(BUSINESS_AMENITY_REPOSITORY) private readonly amenities: Pick<BusinessAmenityRepository, 'create'>,
  ) {}

  async execute(input: CreateBusinessAmenityInput): Promise<Amenity> {
    const { businessId, name, category } = this.validate(input);
    const business = await this.businesses.findById(businessId);
    if (!business) throw new BusinessAmenityBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new BusinessAmenityBusinessArchivedError('El negocio está archivado.');
    const id = randomUUID();
    const now = new Date();
    return this.amenities.create(Amenity.create({ id, businessId, code: `CUSTOM_${id.replaceAll('-', '')}`, name, category, active: true, sortOrder: 0, createdAt: now, updatedAt: now }));
  }

  private validate(input: CreateBusinessAmenityInput): { businessId: string; name: string; category: AmenityCategory } {
    if (!uuid.test(input.businessId)) throw new InvalidBusinessAmenityInputError('El identificador del negocio no es válido.');
    if (typeof input.name !== 'string') throw new InvalidBusinessAmenityInputError('El nombre del amenity es obligatorio.');
    const name = input.name.trim();
    if (!name) throw new InvalidBusinessAmenityInputError('El nombre del amenity es obligatorio.');
    if (name.length > 120) throw new InvalidBusinessAmenityInputError('El nombre del amenity no puede superar 120 caracteres.');
    if (typeof input.category !== 'string' || !categories.has(input.category as AmenityCategory)) throw new InvalidBusinessAmenityInputError('La categoría del amenity no es válida.');
    return { businessId: input.businessId, name, category: input.category as AmenityCategory };
  }
}
