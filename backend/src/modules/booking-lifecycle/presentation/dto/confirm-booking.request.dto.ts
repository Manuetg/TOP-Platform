import { Type } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConfirmBookingPricingItemRequestDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  resourceId!: string;

  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  ratePlanId!: string;

  @ApiPropertyOptional({
    example: 450000,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  agreedAmountMinor?: number;

  @ApiPropertyOptional({
    example: 'Descuento comercial por estadía prolongada',
  })
  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class ConfirmBookingRequestDto {
  @ApiProperty({
    type: [ConfirmBookingPricingItemRequestDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({
    each: true,
  })
  @Type(() => ConfirmBookingPricingItemRequestDto)
  pricing!: ConfirmBookingPricingItemRequestDto[];
}