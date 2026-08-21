import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, InvalidAvailabilityInputError } from '../application/availability.errors';
import { AvailabilityRulesController } from './availability-rules.controller';

const businessId = '11111111-1111-4111-8111-111111111111';
describe('AvailabilityRulesController', () => {
  const getRules = { execute: jest.fn() }; const updateRules = { execute: jest.fn() }; const controller = new AvailabilityRulesController(getRules as never, updateRules as never);
  beforeEach(() => jest.resetAllMocks());
  it('delegates get and partial update exactly', async () => { const result = { businessId, pendingBlocksAvailability: false, bufferBeforeDays: 1, bufferAfterDays: 0 }; getRules.execute.mockResolvedValueOnce(result); updateRules.execute.mockResolvedValueOnce(result); await expect(controller.get(businessId)).resolves.toBe(result); await expect(controller.update(businessId, { pendingBlocksAvailability: false, bufferBeforeDays: 1 })).resolves.toBe(result); expect(updateRules.execute).toHaveBeenCalledWith({ businessId, pendingBlocksAvailability: false, bufferBeforeDays: 1 }); });
  it.each([[new InvalidAvailabilityInputError('invalid'), BadRequestException], [new AvailabilityBusinessNotFoundError('missing'), NotFoundException], [new AvailabilityBusinessUnavailableError('inactive'), ConflictException]])('maps known errors', async (error, expected) => { getRules.execute.mockRejectedValueOnce(error); await expect(controller.get(businessId)).rejects.toBeInstanceOf(expected); });
  it('propagates unexpected errors', async () => { const error = new Error('failure'); updateRules.execute.mockRejectedValueOnce(error); await expect(controller.update(businessId, {})).rejects.toBe(error); });
});
