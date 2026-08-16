import { SeasonalRate } from './seasonal-rate.entity';
export const SEASONAL_RATE_REPOSITORY = Symbol('SEASONAL_RATE_REPOSITORY');
export interface CreateSeasonalRateData { ratePlanId: string; name: string; amountMinor: number; startDate: string; endDate: string; currency: string; }
export interface SeasonalRateRepository { create(data: CreateSeasonalRateData): Promise<SeasonalRate>; listByRatePlanId(ratePlanId: string): Promise<SeasonalRate[]>; hasOverlap(ratePlanId: string, startDate: string, endDate: string): Promise<boolean>; hasOutsideValidity(ratePlanId: string, validFrom: string | null, validTo: string | null): Promise<boolean>; }
