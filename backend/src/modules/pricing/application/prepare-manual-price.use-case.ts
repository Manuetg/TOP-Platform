import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { pricingDateDaysBetween } from '../domain/pricing-date';
import type { ManualPricingSnapshotItem } from '../domain/pricing-snapshot.repository';
import { PRICING_RESOURCE_LOOKUP, type PricingResourceLookup } from '../domain/resource.lookup';
import { manualAgreedAmount, manualPriceReason } from './manual-price-input';
import { validatePricingContext } from './validate-pricing-context';

export interface PrepareManualPriceInput {
  businessId: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
  agreedAmountMinor?: unknown;
  overrideReason?: unknown;
}

@Injectable()
export class PrepareManualPriceUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(PRICING_RESOURCE_LOOKUP) private readonly resources: PricingResourceLookup,
  ) {}

  async execute(input: PrepareManualPriceInput): Promise<{ currency: string; snapshot: ManualPricingSnapshotItem }> {
    const agreedAmountMinor = manualAgreedAmount(input.agreedAmountMinor);
    const overrideReason = manualPriceReason(input.overrideReason);
    const { currency } = await validatePricingContext(input, this.businesses, this.resources, true);
    return {
      currency,
      snapshot: {
        resourceId: input.resourceId,
        ratePlanId: null,
        pricingMode: 'MANUAL_NO_RATE_PLAN',
        suggestedAmountMinor: null,
        adjustmentAmountMinor: null,
        agreedAmountMinor,
        overrideReason,
        nights: pricingDateDaysBetween(input.checkIn, input.checkOut),
        breakdown: [],
      },
    };
  }
}
