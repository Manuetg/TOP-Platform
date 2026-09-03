import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
  type BusinessRepository,
} from '../../business/business.contract';
import { Amenity } from '../domain/amenity.entity';
import {
  BUSINESS_AMENITY_REPOSITORY,
  type BusinessAmenityRepository,
} from '../domain/business-amenity.repository';
import {
  BusinessAmenityBusinessArchivedError,
  BusinessAmenityBusinessNotFoundError,
  InvalidBusinessAmenityInputError,
} from './create-business-amenity.use-case';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ListBusinessAmenitiesUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(BUSINESS_AMENITY_REPOSITORY)
    private readonly amenities: Pick<
      BusinessAmenityRepository,
      'listActiveForBusiness'
    >,
  ) {}

  async execute(businessId: string): Promise<Amenity[]> {
    if (!uuid.test(businessId)) {
      throw new InvalidBusinessAmenityInputError(
        'El identificador del negocio no es válido.',
      );
    }

    const business = await this.businesses.findById(businessId);

    if (!business) {
      throw new BusinessAmenityBusinessNotFoundError(
        'El negocio no existe.',
      );
    }

    if (business.status === BusinessStatus.ARCHIVED) {
      throw new BusinessAmenityBusinessArchivedError(
        'El negocio está archivado.',
      );
    }

    return this.amenities.listActiveForBusiness(businessId);
  }
}
