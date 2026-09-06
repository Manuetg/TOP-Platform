import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class ReorderResourceImagesRequestDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'All Resource image IDs in the desired final order.',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  imageIds!: string[];
}