import { BusinessStatus } from '../../business/business.contract';
import { ResourceStatus } from '../../resource/resource.contract';
import { AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError, CheckAvailabilityUseCase, InvalidAvailabilityInputError } from './check-availability.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';

describe('CheckAvailabilityUseCase', () => {
  const findBusiness = jest.fn(); const findResource = jest.fn(); const booking = jest.fn(); const block = jest.fn();
  const useCase = new CheckAvailabilityUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    { findByIdAndBusinessId: findResource, findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() },
    { hasBlockingBooking: booking }, { hasBlockingBlock: block },
  );

  beforeEach(() => {
    jest.resetAllMocks(); findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE }); findResource.mockResolvedValue({ status: ResourceStatus.ACTIVE }); booking.mockResolvedValue(false); block.mockResolvedValue(false);
  });

  it('validates strict identifiers and ranges before dependencies', async () => {
    await expect(useCase.execute({ businessId: 'bad', resourceId, from: '2026-02-01', to: '2026-02-02' })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(useCase.execute({ businessId, resourceId: 'bad', from: '2026-02-01', to: '2026-02-02' })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(useCase.execute({ businessId: `${businessId}x`, resourceId, from: '2026-02-01', to: '2026-02-02' })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-30', to: '2026-03-01' })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(useCase.execute({ businessId, resourceId, from: 'x2026-02-01', to: '2026-03-01' })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-01' })).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it('returns available without conflicts and delegates the exact semi-open range', async () => {
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-02' })).resolves.toEqual({ resourceId, from: '2026-02-01', to: '2026-02-02', status: 'AVAILABLE', reasons: [] });
    expect(booking).toHaveBeenCalledWith(businessId, resourceId, new Date('2026-02-01'), new Date('2026-02-02'));
    expect(block).toHaveBeenCalledWith(businessId, resourceId, new Date('2026-02-01'), new Date('2026-02-02'));
  });

  it('reports each blocking source once, including simultaneous Booking and Block conflicts', async () => {
    booking.mockResolvedValueOnce(true); block.mockResolvedValueOnce(true);
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-02' })).resolves.toMatchObject({ status: 'UNAVAILABLE', reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'] });
  });

  it.each([[ResourceStatus.OUT_OF_SERVICE, 'RESOURCE_OUT_OF_SERVICE'], [ResourceStatus.ARCHIVED, 'RESOURCE_ARCHIVED']] as const)('short circuits %s resources without conflict lookups', async (status, reason) => {
    findResource.mockResolvedValueOnce({ status });
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-02' })).resolves.toMatchObject({ status: 'UNAVAILABLE', reasons: [reason] });
    expect(booking).not.toHaveBeenCalled(); expect(block).not.toHaveBeenCalled();
  });

  it('rejects a missing business without reading the resource or conflicts', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-02' })).rejects.toBeInstanceOf(AvailabilityBusinessNotFoundError);
    expect(findResource).not.toHaveBeenCalled(); expect(booking).not.toHaveBeenCalled(); expect(block).not.toHaveBeenCalled();
  });

  it('rejects inactive businesses and missing resources before conflict lookups', async () => {
    findBusiness.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED });
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-02' })).rejects.toBeInstanceOf(AvailabilityBusinessUnavailableError);
    findResource.mockResolvedValueOnce(null);
    await expect(useCase.execute({ businessId, resourceId, from: '2026-02-01', to: '2026-02-02' })).rejects.toBeInstanceOf(AvailabilityResourceNotFoundError);
    expect(booking).not.toHaveBeenCalled(); expect(block).not.toHaveBeenCalled();
  });
});
