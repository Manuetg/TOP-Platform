import { BusinessStatus } from '../../business/business.contract';
import { Business } from '../../business/domain/business.entity';
import { ResourceStatus } from '../../resource/domain/resource-status.enum';
import { RatePlan } from '../domain/rate-plan.entity';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { PricingCalculator } from '../domain/pricing-calculator';
import { CalculatePriceUseCase } from './calculate-price.use-case';
import { ListRatePlansUseCase } from './list-rate-plans.use-case';
import { PricingQuoteUseCase } from './pricing-quote.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const firstPlanId = '33333333-3333-4333-8333-333333333333';
const secondPlanId = '44444444-4444-4444-8444-444444444444';
const input = { businessId, resourceId, checkIn: '2026-10-15', checkOut: '2026-10-17' };

function business(): Business {
  return Business.create({ id: businessId, businessNumber: null, name: 'TOP', legalName: null, taxId: null, timezone: 'America/Asuncion', currency: 'PYG', status: BusinessStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
}

function plan(id: string, name: string): RatePlan {
  return RatePlan.create({ id, businessId, name, description: null, baseNightlyAmountMinor: 450000, currency: 'PYG', status: RatePlanStatus.ACTIVE, validFrom: null, validTo: null, resources: [{ id: resourceId, name: 'Cabaña', internalCode: 'CAB' }], createdAt: new Date(), updatedAt: new Date() });
}

describe('PricingQuoteUseCase', () => {
  const findBusiness = jest.fn();
  const findResource = jest.fn();
  const listPlans = jest.fn();
  const findPlan = jest.fn();
  const isAssigned = jest.fn();
  const listSeasons = jest.fn();
  const listRatePlans = new ListRatePlansUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    { findByIdAndBusinessId: findResource },
    { create: jest.fn(), findByIdAndBusinessId: findPlan, listByBusinessId: listPlans, update: jest.fn() },
  );
  const calculatePrice = new CalculatePriceUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    { findByIdAndBusinessId: findResource },
    { create: jest.fn(), findByIdAndBusinessId: findPlan, listByBusinessId: listPlans, update: jest.fn() },
    { isAssigned },
    { create: jest.fn(), listByRatePlanId: jest.fn(), listIntersectingRange: listSeasons, hasOverlap: jest.fn(), hasOutsideValidity: jest.fn() },
    new PricingCalculator(),
  );
  const subject = new PricingQuoteUseCase(listRatePlans, calculatePrice);

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue(business());
    findResource.mockResolvedValue({ id: resourceId, businessId, status: ResourceStatus.ACTIVE });
    listPlans.mockResolvedValue([plan(firstPlanId, 'A plan'), plan(secondPlanId, 'B plan')]);
    findPlan.mockResolvedValue(plan(firstPlanId, 'A plan'));
    isAssigned.mockResolvedValue(true);
    listSeasons.mockResolvedValue([]);
  });

  it('usa la primera tarifa seleccionable y delega todo el cálculo en Pricing', async () => {
    await expect(subject.quote(input)).resolves.toMatchObject({ resourceId, ratePlanId: firstPlanId, ratePlanName: 'A plan', currency: 'PYG', nights: 2, totalAmountMinor: 900000 });
    expect(listPlans).toHaveBeenCalledWith(businessId);
    expect(findPlan).toHaveBeenCalledWith(firstPlanId, businessId);
    expect(isAssigned).toHaveBeenCalledWith(firstPlanId, resourceId);
    expect(listSeasons).toHaveBeenCalledWith(firstPlanId, input.checkIn, input.checkOut);
  });

  it('devuelve null cuando no existe una tarifa seleccionable', async () => {
    listPlans.mockResolvedValueOnce([]);

    await expect(subject.quote(input)).resolves.toBeNull();
    expect(findPlan).not.toHaveBeenCalled();
  });

  it('convierte errores de dominio esperables en una ausencia controlada de cotización', async () => {
    findResource.mockResolvedValueOnce(null);

    await expect(subject.quote(input)).resolves.toBeNull();
  });

  it('propaga errores técnicos sin convertirlos en falta de disponibilidad', async () => {
    const failure = new Error('database unavailable');
    listPlans.mockRejectedValueOnce(failure);

    await expect(subject.quote(input)).rejects.toBe(failure);
  });
});
