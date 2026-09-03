import { Amenity } from './amenity.entity';

export const BUSINESS_AMENITY_REPOSITORY = Symbol('BUSINESS_AMENITY_REPOSITORY');

export interface BusinessAmenityRepository {
  create(amenity: Amenity): Promise<Amenity>;
  listActiveForBusiness(businessId: string): Promise<Amenity[]>;
}
