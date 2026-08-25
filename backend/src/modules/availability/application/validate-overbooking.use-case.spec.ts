import { BusinessStatus } from '../../business/business.contract';
import { ResourceStatus } from '../../resource/resource.contract';
import { AvailabilityResourceNotFoundError, InvalidAvailabilityInputError } from './availability.errors';
import { CheckAvailabilityUseCase } from './check-availability.use-case';
import { ValidateOverbookingUseCase } from './validate-overbooking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const firstResourceId = '22222222-2222-4222-8222-222222222222';
const secondResourceId = '33333333-3333-4333-8333-333333333333';

describe('ValidateOverbookingUseCase', () => {
  const findBusiness = jest.fn();
  const findResource = jest.fn();
  const hasBooking = jest.fn();
  const hasBlock = jest.fn();
  const findRules = jest.fn();
  const check = new CheckAvailabilityUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    { findByIdAndBusinessId: findResource, findByBusinessAndCode: jest.fn(), listByBusinessId: jest.fn(), create: jest.fn(), update: jest.fn() },
    { hasBlockingBooking: hasBooking, listBlockingBookings: jest.fn() },
    { hasBlockingBlock: hasBlock, listBlockingBlocks: jest.fn() },
    { findByBusinessId: findRules, save: jest.fn() },
  );
  const useCase = new ValidateOverbookingUseCase(check);

  const input = (resourceIds = [firstResourceId]) => ({
    businessId,
    resourceIds,
    checkInDate: '2026-03-10',
    checkOutDate: '2026-03-12',
  });

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE });
    findResource.mockResolvedValue({ status: ResourceStatus.ACTIVE });
    hasBooking.mockResolvedValue(false);
    hasBlock.mockResolvedValue(false);
    findRules.mockResolvedValue(null);
  });

  it('returns valid when every requested Resource is available', async () => {
    await expect(useCase.validate(input([firstResourceId, secondResourceId]))).resolves.toEqual({
      valid: true,
      conflicts: [],
    });
    expect(findResource).toHaveBeenCalledWith(firstResourceId, businessId);
    expect(findResource).toHaveBeenCalledWith(secondResourceId, businessId);
  });

  it.each([
    [ResourceStatus.OUT_OF_SERVICE, false, false, ['RESOURCE_OUT_OF_SERVICE']],
    [ResourceStatus.ARCHIVED, false, false, ['RESOURCE_ARCHIVED']],
    [ResourceStatus.ACTIVE, true, false, ['BOOKING_CONFLICT']],
    [ResourceStatus.ACTIVE, false, true, ['BLOCK_CONFLICT']],
  ] as const)(
    'reports the central Availability reason for %s Resources',
    async (status, booking, block, reasons) => {
      findResource.mockResolvedValue({ status });
      hasBooking.mockResolvedValue(booking);
      hasBlock.mockResolvedValue(block);

      await expect(useCase.validate(input())).resolves.toEqual({
        valid: false,
        conflicts: [{ resourceId: firstResourceId, reasons }],
      });
    },
  );

  it('returns deterministic conflicts for multiple Resources and preserves combined reasons', async () => {
    findResource.mockResolvedValue({ status: ResourceStatus.ACTIVE });
    hasBooking.mockImplementation((_businessId: string, resourceId: string) =>
      Promise.resolve(resourceId === firstResourceId),
    );
    hasBlock.mockResolvedValue(true);

    await expect(useCase.validate(input([firstResourceId, secondResourceId]))).resolves.toEqual({
      valid: false,
      conflicts: [
        {
          resourceId: firstResourceId,
          reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'],
        },
        { resourceId: secondResourceId, reasons: ['BLOCK_CONFLICT'] },
      ],
    });
  });

  it('uses Availability Rules for PENDING and Booking-only day buffers', async () => {
    findRules.mockResolvedValue({
      businessId,
      pendingBlocksAvailability: false,
      bufferBeforeDays: 2,
      bufferAfterDays: 1,
    });

    await useCase.validate(input());

    expect(hasBooking).toHaveBeenCalledWith(
      businessId,
      firstResourceId,
      new Date('2026-03-09'),
      new Date('2026-03-14'),
      false,
    );
    expect(hasBlock).toHaveBeenCalledWith(
      businessId,
      firstResourceId,
      new Date('2026-03-10'),
      new Date('2026-03-12'),
    );
  });

  it('preserves tenant isolation from Availability', async () => {
    findResource.mockResolvedValue(null);

    await expect(useCase.validate(input())).rejects.toBeInstanceOf(
      AvailabilityResourceNotFoundError,
    );
  });

  it.each([
    [{ ...input(), resourceIds: [] }],
    [{ ...input(), resourceIds: [firstResourceId, firstResourceId] }],
    [{ ...input(), resourceIds: ['invalid'] }],
    [{ ...input(), checkInDate: '2026-02-30' }],
    [{ ...input(), checkInDate: '2026-03-12', checkOutDate: '2026-03-12' }],
  ])('rejects invalid request data before Availability lookups', async (invalid) => {
    await expect(useCase.validate(invalid)).rejects.toBeInstanceOf(
      InvalidAvailabilityInputError,
    );
    expect(findBusiness).not.toHaveBeenCalled();
  });
});
