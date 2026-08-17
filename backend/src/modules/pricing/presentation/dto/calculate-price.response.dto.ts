import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NightlyPriceSource, type NightlyPriceBreakdown } from '../../domain/pricing-calculator';
import type { CalculatedPrice } from '../../application/calculate-price.use-case';

export class NightlyPriceBreakdownResponseDto {
  @ApiProperty({ example: '2026-12-20' })
  date!: string;

  @ApiProperty({ example: 650000 })
  amountMinor!: number;

  @ApiProperty({ enum: NightlyPriceSource })
  source!: NightlyPriceSource;

  @ApiPropertyOptional({ nullable: true })
  seasonalRateId?: string;

  @ApiPropertyOptional({ nullable: true })
  seasonalRateName?: string;

  static fromDomain(breakdown: NightlyPriceBreakdown): NightlyPriceBreakdownResponseDto {
    return {
      date: breakdown.date,
      amountMinor: breakdown.amountMinor,
      source: breakdown.source,
      ...(breakdown.seasonalRateId === undefined ? {} : { seasonalRateId: breakdown.seasonalRateId }),
      ...(breakdown.seasonalRateName === undefined ? {} : { seasonalRateName: breakdown.seasonalRateName }),
    };
  }
}

export class CalculatePriceResponseDto {
  @ApiProperty() businessId!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() ratePlanId!: string;
  @ApiProperty({ example: 'PYG' }) currency!: string;
  @ApiProperty() checkIn!: string;
  @ApiProperty() checkOut!: string;
  @ApiProperty({ example: 4 }) nights!: number;
  @ApiProperty({ example: 450000 }) baseNightlyAmountMinor!: number;
  @ApiProperty({ example: 2200000 }) totalAmountMinor!: number;
  @ApiProperty({ type: [NightlyPriceBreakdownResponseDto] }) breakdown!: NightlyPriceBreakdownResponseDto[];

  static fromDomain(price: CalculatedPrice): CalculatePriceResponseDto {
    return {
      businessId: price.businessId,
      resourceId: price.resourceId,
      ratePlanId: price.ratePlanId,
      currency: price.currency,
      checkIn: price.checkIn,
      checkOut: price.checkOut,
      nights: price.nights,
      baseNightlyAmountMinor: price.baseNightlyAmountMinor,
      totalAmountMinor: price.totalAmountMinor,
      breakdown: price.breakdown.map((night) => NightlyPriceBreakdownResponseDto.fromDomain(night)),
    };
  }
}
