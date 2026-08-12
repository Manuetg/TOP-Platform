import { Amenity } from './amenity.entity';

export const AMENITY_REPOSITORY = Symbol('AMENITY_REPOSITORY');

export interface AmenityRepository {
  listActive(): Promise<Amenity[]>;
  findManyByIds(ids: string[]): Promise<Amenity[]>;
}
