import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InvalidRatePlanInputError, RatePlanBusinessArchivedError, RatePlanBusinessNotFoundError, RatePlanResourceArchivedError, RatePlanResourceNotFoundError } from '../application/create-rate-plan.use-case';
import { RatePlanArchivedError, RatePlanNotFoundError } from '../application/update-rate-plan.use-case';
import { InvalidSeasonalRateInputError, SeasonalRateOverlapError } from '../application/seasonal-rate.errors';
import { RatePlan } from '../domain/rate-plan.entity';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { SeasonalRate } from '../domain/seasonal-rate.entity';
import { PricingController } from './pricing.controller';

const ratePlan = RatePlan.create({ id: '11111111-1111-4111-8111-111111111111', businessId: '22222222-2222-4222-8222-222222222222', name: 'Plan', description: null, baseNightlyAmountMinor: 1, currency: 'PYG', status: RatePlanStatus.ACTIVE, validFrom: null, validTo: null, resources: [], createdAt: new Date(), updatedAt: new Date() });
const seasonalRate = SeasonalRate.create({ id: '33333333-3333-4333-8333-333333333333', ratePlanId: ratePlan.id, name: 'Navidad', amountMinor: 650000, currency: 'PYG', startDate: '2026-12-20', endDate: '2027-01-06', createdAt: new Date(), updatedAt: new Date() });
describe('PricingController', () => {
  const createExecute = jest.fn(); const updateExecute = jest.fn(); const createSeasonExecute = jest.fn(); const listSeasonExecute = jest.fn();
  const controller = new PricingController({ execute: createExecute } as never, { execute: updateExecute } as never, { execute: createSeasonExecute } as never, { execute: listSeasonExecute } as never);
  const body = { name: 'Plan', baseNightlyAmountMinor: 1, resourceIds: [] };
  beforeEach(() => jest.resetAllMocks());

  it('delegates exact create input and exposes only public DTO', async () => {
    createExecute.mockResolvedValue(ratePlan);
    const result = await controller.create(ratePlan.businessId, body);
    expect(createExecute).toHaveBeenCalledWith({ businessId: ratePlan.businessId, ...body });
    expect(result).toMatchObject({ id: ratePlan.id, currency: 'PYG' }); expect(result).not.toHaveProperty('props');
  });
  it('delegates exact PATCH input once and exposes only public DTO', async () => {
    updateExecute.mockResolvedValue(ratePlan);
    const update = { description: null, resourceIds: [] };
    const result = await controller.update(ratePlan.businessId, ratePlan.id, update);
    expect(updateExecute).toHaveBeenCalledTimes(1);
    expect(updateExecute).toHaveBeenCalledWith({ businessId: ratePlan.businessId, ratePlanId: ratePlan.id, ...update });
    expect(result).toMatchObject({ id: ratePlan.id, description: null }); expect(result).not.toHaveProperty('props');
  });
  it('delegates seasonal POST and GET with exact scope and public DTOs', async () => {
    const body = { name: 'Navidad', amountMinor: 650000, startDate: '2026-12-20', endDate: '2027-01-06' };
    createSeasonExecute.mockResolvedValueOnce(seasonalRate); listSeasonExecute.mockResolvedValueOnce([seasonalRate]);
    const created = await controller.createSeason(ratePlan.businessId, ratePlan.id, body);
    const listed = await controller.listSeasons(ratePlan.businessId, ratePlan.id);
    expect(createSeasonExecute).toHaveBeenCalledWith({ businessId: ratePlan.businessId, ratePlanId: ratePlan.id, ...body });
    expect(listSeasonExecute).toHaveBeenCalledWith(ratePlan.businessId, ratePlan.id);
    expect(created).toMatchObject({ id: seasonalRate.id, currency: 'PYG' }); expect(created).not.toHaveProperty('props');
    expect(listed).toEqual([expect.objectContaining({ id: seasonalRate.id })]);
  });
  it.each([
    [new InvalidRatePlanInputError('invalid'), BadRequestException], [new RatePlanBusinessNotFoundError('missing'), NotFoundException], [new RatePlanResourceNotFoundError('missing'), NotFoundException], [new RatePlanNotFoundError('missing'), NotFoundException], [new RatePlanBusinessArchivedError('archived'), ConflictException], [new RatePlanResourceArchivedError('archived'), ConflictException], [new RatePlanArchivedError('archived'), ConflictException],
  ])('translates expected PATCH errors', async (error, exception) => {
    updateExecute.mockRejectedValueOnce(error);
    await expect(controller.update(ratePlan.businessId, ratePlan.id, {})).rejects.toBeInstanceOf(exception);
  });
  it('propagates unexpected PATCH failures', async () => {
    const failure = new Error('unexpected'); updateExecute.mockRejectedValueOnce(failure);
    await expect(controller.update(ratePlan.businessId, ratePlan.id, {})).rejects.toBe(failure);
  });
  it.each([[new InvalidSeasonalRateInputError('invalid'), BadRequestException], [new SeasonalRateOverlapError('overlap'), ConflictException]])('translates expected seasonal errors', async (error, exception) => {
    createSeasonExecute.mockRejectedValueOnce(error);
    await expect(controller.createSeason(ratePlan.businessId, ratePlan.id, {} as never)).rejects.toBeInstanceOf(exception);
  });
});
