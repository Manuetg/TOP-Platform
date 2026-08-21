import { BusinessStatus } from '../../business/business.contract';
import { Resource } from '../../resource/domain/resource.entity';
import { ResourceStatus } from '../../resource/resource.contract';
import {
  AvailabilityBusinessNotFoundError,
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from './check-availability.use-case';
import { ListAvailabilityCalendarUseCase } from './list-availability-calendar.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceAId = '22222222-2222-4222-8222-222222222222';
const resourceBId = '33333333-3333-4333-8333-333333333333';

const makeResource = (
  id: string,
  status = ResourceStatus.ACTIVE,
  sortOrder = 0,
): Resource =>
  Resource.create({
    id,
    businessId,
    name: id === resourceAId ? 'Cabaña A' : 'Cabaña B',
    internalCode: id,
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 2,
    capacityMaximumChildren: 0,
    status,
    sortOrder,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });

describe('ListAvailabilityCalendarUseCase', () => {
  const findBusiness = jest.fn();
  const findResource = jest.fn();
  const listResources = jest.fn();
  const listBookings = jest.fn();
  const listBlocks = jest.fn();
  const findRules = jest.fn();

  const useCase = new ListAvailabilityCalendarUseCase(
    { findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() },
    {
      findByIdAndBusinessId: findResource,
      findByBusinessAndCode: jest.fn(),
      listByBusinessId: listResources,
      create: jest.fn(),
      update: jest.fn(),
    },
    { hasBlockingBooking: jest.fn(), listBlockingBookings: listBookings },
    { hasBlockingBlock: jest.fn(), listBlockingBlocks: listBlocks },
    { findByBusinessId: findRules, save: jest.fn() },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE });
    listResources.mockResolvedValue([
      makeResource(resourceAId),
      makeResource(resourceBId),
    ]);
    listBookings.mockResolvedValue([]);
    listBlocks.mockResolvedValue([]);
    findRules.mockResolvedValue(null);
  });

  it('builds an ordered resource by day matrix with one range query per conflict source', async () => {
    listBookings.mockResolvedValue([
      {
        resourceId: resourceAId,
        checkInDate: new Date('2026-04-02'),
        checkOutDate: new Date('2026-04-04'),
      },
    ]);
    listBlocks.mockResolvedValue([
      {
        resourceId: resourceAId,
        startsAt: new Date('2026-04-03'),
        endsAt: new Date('2026-04-04'),
      },
    ]);

    await expect(
      useCase.execute({
        businessId,
        from: '2026-04-01',
        to: '2026-04-04',
      }),
    ).resolves.toEqual({
      from: '2026-04-01',
      to: '2026-04-04',
      resources: [
        {
          resourceId: resourceAId,
          days: [
            { date: '2026-04-01', status: 'AVAILABLE', reasons: [] },
            {
              date: '2026-04-02',
              status: 'UNAVAILABLE',
              reasons: ['BOOKING_CONFLICT'],
            },
            {
              date: '2026-04-03',
              status: 'UNAVAILABLE',
              reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'],
            },
          ],
        },
        {
          resourceId: resourceBId,
          days: [
            { date: '2026-04-01', status: 'AVAILABLE', reasons: [] },
            { date: '2026-04-02', status: 'AVAILABLE', reasons: [] },
            { date: '2026-04-03', status: 'AVAILABLE', reasons: [] },
          ],
        },
      ],
    });

    expect(listResources).toHaveBeenCalledTimes(1);
    expect(listBookings).toHaveBeenCalledTimes(1);
    expect(listBookings).toHaveBeenCalledWith(
      businessId,
      new Date('2026-04-01'),
      new Date('2026-04-04'),
      true,
    );
    expect(listBlocks).toHaveBeenCalledTimes(1);
    expect(listBlocks).toHaveBeenCalledWith(
      businessId,
      new Date('2026-04-01'),
      new Date('2026-04-04'),
    );
  });

  it('keeps OUT_OF_SERVICE and ARCHIVED resources in the matrix with their reasons', async () => {
    listResources.mockResolvedValue([
      makeResource(resourceAId, ResourceStatus.OUT_OF_SERVICE),
      makeResource(resourceBId, ResourceStatus.ARCHIVED),
    ]);

    const result = await useCase.execute({
      businessId,
      from: '2026-04-01',
      to: '2026-04-02',
    });

    expect(result.resources).toEqual([
      {
        resourceId: resourceAId,
        days: [
          {
            date: '2026-04-01',
            status: 'UNAVAILABLE',
            reasons: ['RESOURCE_OUT_OF_SERVICE'],
          },
        ],
      },
      {
        resourceId: resourceBId,
        days: [
          {
            date: '2026-04-01',
            status: 'UNAVAILABLE',
            reasons: ['RESOURCE_ARCHIVED'],
          },
        ],
      },
    ]);
  });

  it('uses a single tenant-scoped resource when resourceId is present', async () => {
    const resource = makeResource(resourceBId);
    findResource.mockResolvedValue(resource);

    await expect(
      useCase.execute({
        businessId,
        resourceId: resourceBId,
        from: '2026-04-01',
        to: '2026-04-02',
      }),
    ).resolves.toMatchObject({ resources: [{ resourceId: resourceBId }] });

    expect(findResource).toHaveBeenCalledWith(resourceBId, businessId);
    expect(listResources).not.toHaveBeenCalled();
  });

  it('rejects invalid ranges before reading dependencies and enforces 31 days', async () => {
    await expect(
      useCase.execute({
        businessId: 'invalid',
        from: '2026-04-01',
        to: '2026-04-02',
      }),
    ).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(
      useCase.execute({
        businessId,
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(
      useCase.execute({
        businessId,
        from: '2026-04-01',
        to: '2026-04-01',
      }),
    ).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    await expect(
      useCase.execute({
        businessId,
        from: '2026-04-01',
        to: '2026-05-03',
      }),
    ).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it('allows exactly 31 days and hides a nonexistent or cross-tenant resource', async () => {
    const maximumRange = await useCase.execute({
      businessId,
      from: '2026-04-01',
      to: '2026-05-02',
    });
    expect(maximumRange.resources[0]?.days).toHaveLength(31);

    findResource.mockResolvedValueOnce(null);
    await expect(
      useCase.execute({
        businessId,
        resourceId: resourceBId,
        from: '2026-04-01',
        to: '2026-04-02',
      }),
    ).rejects.toBeInstanceOf(AvailabilityResourceNotFoundError);
  });

  it('rejects a missing business before resource and conflict lookups', async () => {
    findBusiness.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        businessId,
        from: '2026-04-01',
        to: '2026-04-02',
      }),
    ).rejects.toBeInstanceOf(AvailabilityBusinessNotFoundError);

    expect(listResources).not.toHaveBeenCalled();
    expect(listBookings).not.toHaveBeenCalled();
    expect(listBlocks).not.toHaveBeenCalled();
  });

  it('rejects an invalid scoped resource and an inactive business before range lookups', async () => {
    await expect(
      useCase.execute({
        businessId,
        resourceId: 'invalid',
        from: '2026-04-01',
        to: '2026-04-02',
      }),
    ).rejects.toBeInstanceOf(InvalidAvailabilityInputError);
    expect(findBusiness).not.toHaveBeenCalled();

    findBusiness.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED });
    await expect(
      useCase.execute({
        businessId,
        from: '2026-04-01',
        to: '2026-04-02',
      }),
    ).rejects.toMatchObject({
      message: 'El negocio no está activo.',
    });
    expect(listResources).not.toHaveBeenCalled();
    expect(listBookings).not.toHaveBeenCalled();
    expect(listBlocks).not.toHaveBeenCalled();
  });

  it('uses strict daily intersections and ignores unrelated conflicts', async () => {
    findResource.mockResolvedValue(makeResource(resourceAId));
    listBookings.mockResolvedValue([
      {
        resourceId: resourceAId,
        checkInDate: new Date('2026-04-01'),
        checkOutDate: new Date('2026-04-02'),
      },
      {
        resourceId: resourceBId,
        checkInDate: new Date('2026-04-01'),
        checkOutDate: new Date('2026-04-02'),
      },
    ]);
    listBlocks.mockResolvedValue([
      {
        resourceId: resourceAId,
        startsAt: new Date('2026-04-01'),
        endsAt: new Date('2026-04-02'),
      },
      {
        resourceId: resourceBId,
        startsAt: new Date('2026-04-01'),
        endsAt: new Date('2026-04-02'),
      },
    ]);

    const withConflicts = await useCase.execute({
      businessId,
      resourceId: resourceAId,
      from: '2026-04-01',
      to: '2026-04-02',
    });
    expect(withConflicts.resources[0]?.days[0]).toMatchObject({
      status: 'UNAVAILABLE',
      reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'],
    });

    listBookings.mockResolvedValue([
      {
        resourceId: resourceAId,
        checkInDate: new Date('2026-03-31'),
        checkOutDate: new Date('2026-04-01'),
      },
    ]);
    listBlocks.mockResolvedValue([
      {
        resourceId: resourceAId,
        startsAt: new Date('2026-03-31'),
        endsAt: new Date('2026-04-01'),
      },
    ]);
    const contiguous = await useCase.execute({
      businessId,
      resourceId: resourceAId,
      from: '2026-04-01',
      to: '2026-04-02',
    });
    expect(contiguous.resources[0]?.days[0]).toEqual({
      date: '2026-04-01',
      status: 'AVAILABLE',
      reasons: [],
    });
  });

  it('applies Booking-only day buffers using the same effective rule', async () => {
    listResources.mockResolvedValue([makeResource(resourceAId)]);
    findRules.mockResolvedValueOnce({ businessId, pendingBlocksAvailability: false, bufferBeforeDays: 1, bufferAfterDays: 0 });
    listBookings.mockResolvedValue([{ resourceId: resourceAId, checkInDate: new Date('2026-04-02'), checkOutDate: new Date('2026-04-03') }]);
    listBlocks.mockResolvedValue([{ resourceId: resourceAId, startsAt: new Date('2026-04-01'), endsAt: new Date('2026-04-02') }]);
    const result = await useCase.execute({ businessId, from: '2026-04-01', to: '2026-04-03' });
    expect(listBookings).toHaveBeenCalledWith(businessId, new Date('2026-04-01'), new Date('2026-04-04'), false);
    expect(result.resources[0]?.days).toEqual([{ date: '2026-04-01', status: 'UNAVAILABLE', reasons: ['BOOKING_CONFLICT', 'BLOCK_CONFLICT'] }, { date: '2026-04-02', status: 'UNAVAILABLE', reasons: ['BOOKING_CONFLICT'] }]);
  });

  it('widens the batch lookup backwards for a Booking after-buffer', async () => {
    findRules.mockResolvedValueOnce({ businessId, pendingBlocksAvailability: true, bufferBeforeDays: 0, bufferAfterDays: 2 });
    await useCase.execute({ businessId, from: '2026-04-03', to: '2026-04-04' });
    expect(listBookings).toHaveBeenCalledWith(businessId, new Date('2026-04-01'), new Date('2026-04-04'), true);
  });
});
