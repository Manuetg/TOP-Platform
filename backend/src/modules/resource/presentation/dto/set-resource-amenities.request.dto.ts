import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetResourceAmenitiesRequestDto {
  @ApiProperty({ type: [String], example: [], description: 'Complete replacement of the resource amenities. An empty array removes all assignments.' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  amenityIds!: string[];
}
