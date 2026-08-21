import { ApiProperty } from '@nestjs/swagger';
import type { ManualPriceOverride } from '../../application/apply-manual-price-override.use-case';
import { NightlyPriceBreakdownResponseDto } from './calculate-price.response.dto';

export class ManualPriceOverrideResponseDto {
  @ApiProperty() businessId!: string;
  @ApiProperty() resourceId!: string;
  @ApiProperty() ratePlanId!: string;
  @ApiProperty({ example: 'PYG' }) currency!: string;
  @ApiProperty() checkIn!: string;
  @ApiProperty() checkOut!: string;
  @ApiProperty({ example: 4 }) nights!: number;
  @ApiProperty({ example: 'MANUAL_OVERRIDE' }) pricingMode!: 'MANUAL_OVERRIDE';
  @ApiProperty({ example: 2200000 }) suggestedAmountMinor!: number;
  @ApiProperty({ example: 2000000 }) agreedAmountMinor!: number;
  @ApiProperty({ example: -200000 }) adjustmentAmountMinor!: number;
  @ApiProperty() overrideReason!: string;
  @ApiProperty({ type: [NightlyPriceBreakdownResponseDto] }) suggestedBreakdown!: NightlyPriceBreakdownResponseDto[];

  static fromDomain(override: ManualPriceOverride): ManualPriceOverrideResponseDto {
    return {
      businessId: override.businessId,
      resourceId: override.resourceId,
      ratePlanId: override.ratePlanId,
      currency: override.currency,
      checkIn: override.checkIn,
      checkOut: override.checkOut,
      nights: override.nights,
      pricingMode: override.pricingMode,
      suggestedAmountMinor: override.suggestedAmountMinor,
      agreedAmountMinor: override.agreedAmountMinor,
      adjustmentAmountMinor: override.adjustmentAmountMinor,
      overrideReason: override.overrideReason,
      suggestedBreakdown: override.suggestedBreakdown.map((night) => NightlyPriceBreakdownResponseDto.fromDomain(night)),
    };
  }
}
