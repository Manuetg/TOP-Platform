import { Injectable } from '@nestjs/common';
import {
  CalculatePriceBusinessArchivedError,
  CalculatePriceBusinessNotFoundError,
  CalculatePriceOutsideValidityError,
  CalculatePriceRatePlanArchivedError,
  CalculatePriceRatePlanNotAssignedError,
  CalculatePriceRatePlanNotFoundError,
  CalculatePriceResourceNotFoundError,
  CalculatePriceResourceUnavailableError,
  InvalidCalculatePriceInputError,
} from './calculate-price.errors';
import { CalculatePriceUseCase } from './calculate-price.use-case';
import {
  InvalidListRatePlansInputError,
  ListRatePlansBusinessArchivedError,
  ListRatePlansBusinessNotFoundError,
  ListRatePlansResourceNotFoundError,
  ListRatePlansResourceUnavailableError,
  ListRatePlansUseCase,
} from './list-rate-plans.use-case';
import type { PricingQuote, PricingQuoteInput, PricingQuoteResult } from '../pricing.contract';

const expectedPricingErrors = [
  InvalidCalculatePriceInputError,
  CalculatePriceBusinessArchivedError,
  CalculatePriceBusinessNotFoundError,
  CalculatePriceOutsideValidityError,
  CalculatePriceRatePlanArchivedError,
  CalculatePriceRatePlanNotAssignedError,
  CalculatePriceRatePlanNotFoundError,
  CalculatePriceResourceNotFoundError,
  CalculatePriceResourceUnavailableError,
  InvalidListRatePlansInputError,
  ListRatePlansBusinessArchivedError,
  ListRatePlansBusinessNotFoundError,
  ListRatePlansResourceNotFoundError,
  ListRatePlansResourceUnavailableError,
];

@Injectable()
export class PricingQuoteUseCase implements PricingQuote {
  constructor(
    private readonly listRatePlans: ListRatePlansUseCase,
    private readonly calculatePrice: CalculatePriceUseCase,
  ) {}

  async quote(input: PricingQuoteInput): Promise<PricingQuoteResult | null> {
    try {
      const plans = await this.listRatePlans.execute(input);
      const selectedPlan = plans[0];
      if (!selectedPlan) return null;

      const price = await this.calculatePrice.execute({ ...input, ratePlanId: selectedPlan.id });
      return {
        businessId: price.businessId,
        resourceId: price.resourceId,
        ratePlanId: price.ratePlanId,
        ratePlanName: selectedPlan.name,
        currency: price.currency,
        checkIn: price.checkIn,
        checkOut: price.checkOut,
        nights: price.nights,
        totalAmountMinor: price.totalAmountMinor,
      };
    } catch (error: unknown) {
      if (this.isExpectedPricingError(error)) return null;
      throw error;
    }
  }

  private isExpectedPricingError(error: unknown): boolean {
    return error instanceof Error && expectedPricingErrors.some((type) => error instanceof type);
  }
}
