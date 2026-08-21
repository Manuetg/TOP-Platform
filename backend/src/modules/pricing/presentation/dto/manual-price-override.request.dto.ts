import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID } from 'class-validator';

export class ManualPriceOverrideRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  resourceId!: string;

  @ApiProperty({ example: '2026-12-18' })
  @IsString()
  checkIn!: string;

  @ApiProperty({ example: '2026-12-22' })
  @IsString()
  checkOut!: string;

  @ApiProperty({ example: 2000000, minimum: 0 })
  @IsInt()
  agreedAmountMinor!: number;

  @ApiProperty({ example: 'Descuento comercial por estadía prolongada' })
  @IsString()
  overrideReason!: string;
}
