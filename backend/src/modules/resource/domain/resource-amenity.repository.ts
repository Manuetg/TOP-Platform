import { Amenity } from './amenity.entity';

export const RESOURCE_AMENITY_REPOSITORY = Symbol('RESOURCE_AMENITY_REPOSITORY');

export interface ResourceAmenityRepository {
  replace(resourceId: string, amenityIds: string[]): Promise<void>;
  listByResourceId(resourceId: string): Promise<Amenity[]>;
}
