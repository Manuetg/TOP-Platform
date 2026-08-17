import { SeasonalRate } from '../../../src/modules/pricing/domain/seasonal-rate.entity';
import type { CreateSeasonalRateData, SeasonalRateRepository } from '../../../src/modules/pricing/domain/seasonal-rate.repository';

let rates: SeasonalRate[] = [];

export function resetSeasonalRateRepositoryFake(): void {
  rates = [];
}

export const seasonalRateRepositoryFake: SeasonalRateRepository = {
  create: (data: CreateSeasonalRateData): Promise<SeasonalRate> => {
    const rate = SeasonalRate.create({ id: `77777777-7777-4777-8777-${String(rates.length + 1).padStart(12, '0')}`, ...data, createdAt: new Date(), updatedAt: new Date() });
    rates.push(rate);
    return Promise.resolve(rate);
  },
  listByRatePlanId: (ratePlanId: string): Promise<SeasonalRate[]> => Promise.resolve(rates.filter((rate) => rate.ratePlanId === ratePlanId).sort((left, right) => left.startDate.localeCompare(right.startDate))),
  listIntersectingRange: (ratePlanId: string, checkIn: string, checkOut: string): Promise<SeasonalRate[]> => Promise.resolve(rates.filter((rate) => rate.ratePlanId === ratePlanId && rate.startDate < checkOut && rate.endDate > checkIn).sort((left, right) => left.startDate.localeCompare(right.startDate) || left.endDate.localeCompare(right.endDate) || left.id.localeCompare(right.id))),
  hasOverlap: (ratePlanId: string, startDate: string, endDate: string): Promise<boolean> => Promise.resolve(rates.some((rate) => rate.ratePlanId === ratePlanId && rate.startDate < endDate && rate.endDate > startDate)),
  hasOutsideValidity: (ratePlanId: string, validFrom: string | null, validTo: string | null): Promise<boolean> => Promise.resolve(rates.some((rate) => rate.ratePlanId === ratePlanId && ((validFrom !== null && rate.startDate < validFrom) || (validTo !== null && rate.endDate > validTo)))),
};
