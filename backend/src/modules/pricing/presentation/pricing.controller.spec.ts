import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RatePlan } from '../domain/rate-plan.entity';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { InvalidRatePlanInputError, RatePlanBusinessArchivedError, RatePlanBusinessNotFoundError, RatePlanResourceArchivedError, RatePlanResourceNotFoundError } from '../application/create-rate-plan.use-case';
import { PricingController } from './pricing.controller';

const ratePlan = RatePlan.create({ id: '11111111-1111-4111-8111-111111111111', businessId: '22222222-2222-4222-8222-222222222222', name: 'Plan', description: null, baseNightlyAmountMinor: 1, currency: 'PYG', status: RatePlanStatus.ACTIVE, validFrom: null, validTo: null, resources: [], createdAt: new Date(), updatedAt: new Date() });
describe('PricingController', () => {
  const execute = jest.fn();
  const controller = new PricingController({ execute } as never);
  const body = { name: 'Plan', baseNightlyAmountMinor: 1, resourceIds: [] };
  beforeEach(() => jest.resetAllMocks());
  it('delegates exact input and exposes only public DTO', async () => {
    execute.mockResolvedValue(ratePlan);
    const result = await controller.create(ratePlan.businessId, body);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ businessId: ratePlan.businessId, ...body });
    expect(result).toMatchObject({ id: ratePlan.id, currency: 'PYG' });
    expect(result).not.toHaveProperty('props');
  });
  it.each([
    [new InvalidRatePlanInputError('invalid'), BadRequestException],
    [new RatePlanBusinessNotFoundError('missing'), NotFoundException],
    [new RatePlanResourceNotFoundError('missing'), NotFoundException],
    [new RatePlanBusinessArchivedError('archived'), ConflictException],
    [new RatePlanResourceArchivedError('archived'), ConflictException],
  ])('translates expected errors', async (error, exception) => {
    execute.mockRejectedValueOnce(error);
    await expect(controller.create(ratePlan.businessId, body)).rejects.toBeInstanceOf(exception);
  });
  it('propagates unexpected failures', async () => {
    const failure = new Error('unexpected'); execute.mockRejectedValueOnce(failure);
    await expect(controller.create(ratePlan.businessId, body)).rejects.toBe(failure);
  });
});
