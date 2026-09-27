import { Injectable } from '@nestjs/common';
import type { NightlyPriceBreakdown } from '../domain/pricing-calculator';
import { CalculatePriceUseCase } from './calculate-price.use-case';
import { manualAgreedAmount, manualPriceReason } from './manual-price-input';

export interface ApplyManualPriceOverrideInput {
  businessId: string;
  ratePlanId: string;
  resourceId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  agreedAmountMinor?: unknown;
  overrideReason?: unknown;
}

export interface ManualPriceOverride {
  businessId: string;
  resourceId: string;
  ratePlanId: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricingMode: 'MANUAL_OVERRIDE';
  suggestedAmountMinor: number;
  agreedAmountMinor: number;
  adjustmentAmountMinor: number;
  overrideReason: string;
  suggestedBreakdown: NightlyPriceBreakdown[];
}

@Injectable()
export class ApplyManualPriceOverrideUseCase {
  constructor(private readonly calculatePrice: CalculatePriceUseCase) {}

  async execute(input: ApplyManualPriceOverrideInput): Promise<ManualPriceOverride> {
    const agreedAmountMinor = manualAgreedAmount(input.agreedAmountMinor);
    const overrideReason = manualPriceReason(input.overrideReason);
    const suggested = await this.calculatePrice.execute({
      businessId: input.businessId,
      ratePlanId: input.ratePlanId,
      resourceId: input.resourceId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    });

    return {
      businessId: suggested.businessId,
      resourceId: suggested.resourceId,
      ratePlanId: suggested.ratePlanId,
      currency: suggested.currency,
      checkIn: suggested.checkIn,
      checkOut: suggested.checkOut,
      nights: suggested.nights,
      pricingMode: 'MANUAL_OVERRIDE',
      suggestedAmountMinor: suggested.totalAmountMinor,
      agreedAmountMinor,
      adjustmentAmountMinor: agreedAmountMinor - suggested.totalAmountMinor,
      overrideReason,
      suggestedBreakdown: suggested.breakdown,
    };
  }

}
