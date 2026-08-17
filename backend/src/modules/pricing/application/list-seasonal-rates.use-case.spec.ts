import { Business } from '../../business/domain/business.entity';
import { BusinessStatus } from '../../business/domain/business-status.enum';
import type { BusinessRepository } from '../../business/domain/business.repository';
import { RatePlan } from '../domain/rate-plan.entity';
import type { RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { SeasonalRate } from '../domain/seasonal-rate.entity';
import type { SeasonalRateRepository } from '../domain/seasonal-rate.repository';
import { ListSeasonalRatesUseCase } from './list-seasonal-rates.use-case';
import {
  InvalidSeasonalRateInputError,
  SeasonalRateBusinessNotFoundError,
  SeasonalRatePlanNotFoundError,
} from './seasonal-rate.errors';

const businessId = '11111111-1111-4111-8111-111111111111';
const ratePlanId = '22222222-2222-4222-8222-222222222222';

const business = (): Business => Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
const plan = (status = RatePlanStatus.ACTIVE): RatePlan => RatePlan.create({ id: ratePlanId, businessId, name: 'Base', description: null, baseNightlyAmountMinor: 450000, currency: 'PYG', status, validFrom: null, validTo: null, resources: [], createdAt: new Date(), updatedAt: new Date() });
const season = (id: string, startDate: string): SeasonalRate => SeasonalRate.create({ id, ratePlanId, name: `Season ${id}`, amountMinor: 650000, startDate, endDate: '2027-01-01', currency: 'PYG', createdAt: new Date(), updatedAt: new Date() });

describe('ListSeasonalRatesUseCase', () => {
  const findBusiness: jest.MockedFunction<BusinessRepository['findById']> = jest.fn();
  const findRatePlan: jest.MockedFunction<RatePlanRepository['findByIdAndBusinessId']> = jest.fn();
  const listByRatePlanId: jest.MockedFunction<SeasonalRateRepository['listByRatePlanId']> = jest.fn();
  const subject = new ListSeasonalRatesUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    { create: jest.fn(), findByIdAndBusinessId: findRatePlan, update: jest.fn() },
    { create: jest.fn(), listByRatePlanId, listIntersectingRange: jest.fn(), hasOverlap: jest.fn(), hasOutsideValidity: jest.fn() },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue(business());
    findRatePlan.mockResolvedValue(plan());
    listByRatePlanId.mockResolvedValue([]);
  });

  it('validates ids before lookup', async () => {
    await expect(subject.execute('invalid', ratePlanId)).rejects.toThrow(new InvalidSeasonalRateInputError('El identificador del negocio no es válido.'));
    await expect(subject.execute(businessId, 'invalid')).rejects.toThrow(new InvalidSeasonalRateInputError('El identificador de la tarifa no es válido.'));
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findRatePlan).not.toHaveBeenCalled();
    expect(listByRatePlanId).not.toHaveBeenCalled();
  });

  it('returns the repository list, including empty and multiple results', async () => {
    await expect(subject.execute(businessId, ratePlanId)).resolves.toEqual([]);
    const rates = [season('33333333-3333-4333-8333-333333333333', '2026-12-01'), season('44444444-4444-4444-8444-444444444444', '2027-01-01')];
    listByRatePlanId.mockResolvedValueOnce(rates);
    await expect(subject.execute(businessId, ratePlanId)).resolves.toEqual(rates);
    expect(listByRatePlanId).toHaveBeenLastCalledWith(ratePlanId);
  });

  it('rejects missing Business and hidden cross-tenant RatePlans', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(subject.execute(businessId, ratePlanId)).rejects.toThrow(new SeasonalRateBusinessNotFoundError('El negocio no existe.'));
    expect(findRatePlan).not.toHaveBeenCalled();

    findRatePlan.mockResolvedValueOnce(null);
    await expect(subject.execute(businessId, '55555555-5555-4555-8555-555555555555')).rejects.toThrow(new SeasonalRatePlanNotFoundError('La tarifa no existe.'));
    expect(listByRatePlanId).not.toHaveBeenCalled();
  });

  it('allows historical listing of an archived RatePlan', async () => {
    findRatePlan.mockResolvedValueOnce(plan(RatePlanStatus.ARCHIVED));
    const rates = [season('33333333-3333-4333-8333-333333333333', '2026-12-01')];
    listByRatePlanId.mockResolvedValueOnce(rates);
    await expect(subject.execute(businessId, ratePlanId)).resolves.toEqual(rates);
    expect(listByRatePlanId).toHaveBeenCalledWith(ratePlanId);
  });

  it('propagates repository failures', async () => {
    const failure = new Error('database unavailable');
    listByRatePlanId.mockRejectedValueOnce(failure);
    await expect(subject.execute(businessId, ratePlanId)).rejects.toBe(failure);
  });
});
