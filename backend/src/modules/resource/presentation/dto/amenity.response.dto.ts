import { ApiProperty } from '@nestjs/swagger';
import { Amenity } from '../../domain/amenity.entity';

export class AmenityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ enum: ['GLOBAL', 'BUSINESS'] }) scope!: 'GLOBAL' | 'BUSINESS';

  static fromDomain(amenity: Amenity): AmenityResponseDto { return { id: amenity.id, code: amenity.code, name: amenity.name, category: amenity.category, sortOrder: amenity.sortOrder, scope: amenity.scope }; }
}

export class ResourceAmenityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty({ enum: ['GLOBAL', 'BUSINESS'] }) scope!: 'GLOBAL' | 'BUSINESS';

  static fromDomain(amenity: Amenity): ResourceAmenityResponseDto { return { id: amenity.id, code: amenity.code, name: amenity.name, category: amenity.category, scope: amenity.scope }; }
}
