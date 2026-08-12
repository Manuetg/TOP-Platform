import { ApiProperty } from '@nestjs/swagger';
import { Amenity } from '../../domain/amenity.entity';

export class AmenityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() sortOrder!: number;

  static fromDomain(amenity: Amenity): AmenityResponseDto { return { id: amenity.id, code: amenity.code, name: amenity.name, category: amenity.category, sortOrder: amenity.sortOrder }; }
}

export class ResourceAmenityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;

  static fromDomain(amenity: Amenity): ResourceAmenityResponseDto { return { id: amenity.id, code: amenity.code, name: amenity.name, category: amenity.category }; }
}
