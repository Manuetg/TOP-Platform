import { Inject, Injectable } from '@nestjs/common';
import { AMENITY_REPOSITORY, type AmenityRepository } from '../domain/amenity.repository';
import { Amenity } from '../domain/amenity.entity';

@Injectable()
export class ListAmenitiesUseCase {
  constructor(@Inject(AMENITY_REPOSITORY) private readonly amenities: AmenityRepository) {}
  execute(): Promise<Amenity[]> { return this.amenities.listActive(); }
}
