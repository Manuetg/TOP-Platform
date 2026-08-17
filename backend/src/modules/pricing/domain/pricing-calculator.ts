import { addPricingDateDays, pricingDateDaysBetween } from './pricing-date';
import type { SeasonalRate } from './seasonal-rate.entity';

export enum NightlyPriceSource {
  BASE = 'BASE',
  SEASONAL = 'SEASONAL',
}

export interface NightlyPriceBreakdown {
  date: string;
  amountMinor: number;
  source: NightlyPriceSource;
  seasonalRateId?: string;
  seasonalRateName?: string;
}

export interface PricingCalculation {
  nights: number;
  breakdown: NightlyPriceBreakdown[];
  totalAmountMinor: number;
}

export class PricingCalculationOverflowError extends Error {}

export class PricingCalculator {
  calculate(
    baseNightlyAmountMinor: number,
    checkIn: string,
    checkOut: string,
    seasonalRates: SeasonalRate[],
  ): PricingCalculation {
    const nights = pricingDateDaysBetween(checkIn, checkOut);
    const orderedSeasons = [...seasonalRates].sort(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) ||
        left.endDate.localeCompare(right.endDate) ||
        left.id.localeCompare(right.id),
    );
    const breakdown: NightlyPriceBreakdown[] = [];
    let totalAmountMinor = 0;

    for (let index = 0; index < nights; index += 1) {
      const date = addPricingDateDays(checkIn, index);
      const seasonalRate = orderedSeasons.find(
        (rate) => rate.startDate <= date && date < rate.endDate,
      );
      const amountMinor = seasonalRate?.amountMinor ?? baseNightlyAmountMinor;

      if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(totalAmountMinor + amountMinor)) {
        throw new PricingCalculationOverflowError('El total calculado excede el rango seguro.');
      }

      totalAmountMinor += amountMinor;
      breakdown.push(
        seasonalRate
          ? {
              date,
              amountMinor,
              source: NightlyPriceSource.SEASONAL,
              seasonalRateId: seasonalRate.id,
              seasonalRateName: seasonalRate.name,
            }
          : { date, amountMinor, source: NightlyPriceSource.BASE },
      );
    }

    return { nights, breakdown, totalAmountMinor };
  }
}
