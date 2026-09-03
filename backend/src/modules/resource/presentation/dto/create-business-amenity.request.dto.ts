import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { AmenityCategory } from '../../domain/amenity.entity';

export class CreateBusinessAmenityRequestDto {
  @ApiProperty({ maxLength: 120, example: 'Muelle privado' }) @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ enum: ['CONNECTIVITY', 'CLIMATE', 'BATHROOM', 'KITCHEN', 'ENTERTAINMENT', 'OUTDOOR', 'PARKING', 'SERVICES', 'ACCESSIBILITY', 'GENERAL'] }) @IsIn(['CONNECTIVITY', 'CLIMATE', 'BATHROOM', 'KITCHEN', 'ENTERTAINMENT', 'OUTDOOR', 'PARKING', 'SERVICES', 'ACCESSIBILITY', 'GENERAL']) category!: AmenityCategory;
}
