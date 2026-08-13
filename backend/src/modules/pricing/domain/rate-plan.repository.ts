import { RatePlan } from './rate-plan.entity';
export const RATE_PLAN_REPOSITORY = Symbol('RATE_PLAN_REPOSITORY');
export interface CreateRatePlanData { businessId: string; name: string; description: string | null; baseNightlyAmountMinor: number; currency: string; validFrom: string | null; validTo: string | null; resourceIds: string[]; }
export interface RatePlanRepository { create(data: CreateRatePlanData): Promise<RatePlan>; }
