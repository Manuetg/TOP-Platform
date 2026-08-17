import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class CalculatePriceRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  resourceId!: string;

  @ApiProperty({ example: '2026-12-18' })
  @IsString()
  checkIn!: string;

  @ApiProperty({ example: '2026-12-22' })
  @IsString()
  checkOut!: string;
}
