import { Type } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsIn,
  ValidateIf,
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatorio salvo en MANUAL_NO_RATE_PLAN; en ese modo debe omitirse.' })
  @ValidateIf((item: ConfirmBookingPricingItemRequestDto) => item.pricingMode !== 'MANUAL_NO_RATE_PLAN' || item.ratePlanId !== undefined)
  @IsUUID('4')
  ratePlanId?: string;

  @ApiPropertyOptional({ enum: ['MANUAL_NO_RATE_PLAN'], description: 'Precio excepcional sin tarifario aplicable. Requiere monto, motivo y permiso de ajuste.' })
  @ValidateIf((_item: unknown, value: unknown) => value !== undefined)
  @IsIn(['MANUAL_NO_RATE_PLAN'])
  pricingMode?: 'MANUAL_NO_RATE_PLAN';

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