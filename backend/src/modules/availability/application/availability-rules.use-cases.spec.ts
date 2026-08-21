import { BusinessStatus } from '../../business/business.contract';
import { AvailabilityBusinessNotFoundError, InvalidAvailabilityInputError } from './availability.errors';
import { GetAvailabilityRulesUseCase, UpdateAvailabilityRulesUseCase } from './availability-rules.use-cases';
import type { AvailabilityRules } from '../domain/availability-rules.repository';

const businessId = '11111111-1111-4111-8111-111111111111';

describe('Availability rules use cases', () => {
  const findBusiness = jest.fn();
  const findRules = jest.fn();
  const save = jest.fn();
  const get = new GetAvailabilityRulesUseCase({ findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() }, { findByBusinessId: findRules, save });
  const update = new UpdateAvailabilityRulesUseCase(get, { findByBusinessId: findRules, save });

  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE }); findRules.mockResolvedValue(null); save.mockImplementation((rules: AvailabilityRules) => Promise.resolve(rules)); });

  it('returns compatible defaults when the business has no configuration', async () => {
    await expect(get.execute(businessId)).resolves.toEqual({ businessId, pendingBlocksAvailability: true, bufferBeforeDays: 0, bufferAfterDays: 0 });
  });

  it('updates only supplied rules over the effective defaults', async () => {
    await expect(update.execute({ businessId, pendingBlocksAvailability: false, bufferAfterDays: 2 })).resolves.toEqual({ businessId, pendingBlocksAvailability: false, bufferBeforeDays: 0, bufferAfterDays: 2 });
    expect(save).toHaveBeenCalledWith({ businessId, pendingBlocksAvailability: false, bufferBeforeDays: 0, bufferAfterDays: 2 });
  });

  it.each([{ pendingBlocksAvailability: false }, { bufferBeforeDays: 0 }, { bufferAfterDays: 0 }])('accepts each individual partial rule %#', async (input) => {
    await expect(update.execute({ businessId, ...input })).resolves.toMatchObject(input);
  });

  it.each([{ bufferBeforeDays: -1 }, { bufferAfterDays: 1.5 }, { bufferAfterDays: '1' }, { pendingBlocksAvailability: 'false' }, {}])('rejects invalid rule input %#', async (input) => {
    await expect(update.execute({ businessId, ...input })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    expect(save).not.toHaveBeenCalled();
  });

  it('hides no missing business behind defaults', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(get.execute(businessId)).rejects.toBeInstanceOf(AvailabilityBusinessNotFoundError);
    expect(findRules).not.toHaveBeenCalled();
  });
});
