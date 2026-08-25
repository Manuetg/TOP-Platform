import { BusinessStatus } from '../../business/business.contract';
import { ResourceStatus } from '../../resource/resource.contract';
import {
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from './availability.errors';
import { CheckAvailabilityUseCase } from './check-availability.use-case';
import { ValidateOverbookingUseCase } from './validate-overbooking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const firstResourceId = '22222222-2222-4222-8222-222222222222';
const secondResourceId = '33333333-3333-4333-8333-333333333333';
const excludeBookingId = '44444444-4444-4444-8444-444444444444';

describe('ValidateOverbookingUseCase', () => {
  const findBusiness = jest.fn();
  const findResource = jest.fn();
  const hasBooking = jest.fn();
  const hasBlock = jest.fn();
  const findRules = jest.fn();

  const check = new CheckAvailabilityUseCase(
    {
      findById: findBusiness,
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    },
    {
      findByIdAndBusinessId: findResource,
      findByBusinessAndCode: jest.fn(),
      listByBusinessId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    {
      hasBlockingBooking: hasBooking,
      listBlockingBookings: jest.fn(),
    },
    {
      hasBlockingBlock: hasBlock,
      listBlockingBlocks: jest.fn(),
    },
    {
      findByBusinessId: findRules,
      save: jest.fn(),
    },
  );

  const useCase = new ValidateOverbookingUseCase(check);

  const input = (
    resourceIds = [firstResourceId],
    excludedBookingId?: string,
  ) => ({
    businessId,
    resourceIds,
    checkInDate: '2026-03-10',
    checkOutDate: '2026-03-12',
    ...(excludedBookingId !== undefined
      ? {
          excludeBookingId: excludedBookingId,
        }
      : {}),
  });

  beforeEach(() => {
    jest.resetAllMocks();

    findBusiness.mockResolvedValue({
      status: BusinessStatus.ACTIVE,
    });

    findResource.mockResolvedValue({
      status: ResourceStatus.ACTIVE,
    });

    hasBooking.mockResolvedValue(false);
    hasBlock.mockResolvedValue(false);
    findRules.mockResolvedValue(null);
  });

  it('returns valid when every requested Resource is available', async () => {
    await expect(
      useCase.validate(
        input([firstResourceId, secondResourceId]),
      ),
    ).resolves.toEqual({
      valid: true,
      conflicts: [],
    });

    expect(findResource).toHaveBeenCalledWith(
      firstResourceId,
      businessId,
    );

    expect(findResource).toHaveBeenCalledWith(
      secondResourceId,
      businessId,
    );
  });

  it('propagates excludeBookingId to every Resource availability validation', async () => {
    await expect(
      useCase.validate(
        input(
          [firstResourceId, secondResourceId],
          excludeBookingId,
        ),
      ),
    ).resolves.toEqual({
      valid: true,
      conflicts: [],
    });

    expect(hasBooking).toHaveBeenCalledTimes(2);

    expect(hasBooking).toHaveBeenCalledWith(
      businessId,
      firstResourceId,
      new Date('2026-03-10'),
      new Date('2026-03-12'),
      true,
      excludeBookingId,
    );

    expect(hasBooking).toHaveBeenCalledWith(
      businessId,
      secondResourceId,
      new Date('2026-03-10'),
      new Date('2026-03-12'),
      true,
      excludeBookingId,
    );
  });

  it.each([
    [
      ResourceStatus.OUT_OF_SERVICE,
      false,
      false,
      ['RESOURCE_OUT_OF_SERVICE'],
    ],
    [
      ResourceStatus.ARCHIVED,
      false,
      false,
      ['RESOURCE_ARCHIVED'],
    ],
    [
      ResourceStatus.ACTIVE,
      true,
      false,
      ['BOOKING_CONFLICT'],
    ],
    [
      ResourceStatus.ACTIVE,
      false,
      true,
      ['BLOCK_CONFLICT'],
    ],
  ] as const)(
    'reports the central Availability reason for %s Resources',
    async (status, booking, block, reasons) => {
      findResource.mockResolvedValue({ status });
      hasBooking.mockResolvedValue(booking);
      hasBlock.mockResolvedValue(block);

      await expect(
        useCase.validate(input()),
      ).resolves.toEqual({
        valid: false,
        conflicts: [
          {
            resourceId: firstResourceId,
            reasons,
          },
        ],
      });
    },
  );

  it('returns deterministic conflicts for multiple Resources and preserves combined reasons', async () => {
    findResource.mockResolvedValue({
      status: ResourceStatus.ACTIVE,
    });

    hasBooking.mockImplementation(
      (_businessId: string, resourceId: string) =>
        Promise.resolve(resourceId === firstResourceId),
    );

    hasBlock.mockResolvedValue(true);

    await expect(
      useCase.validate(
        input([firstResourceId, secondResourceId]),
      ),
    ).resolves.toEqual({
      valid: false,
      conflicts: [
        {
          resourceId: firstResourceId,
          reasons: [
            'BOOKING_CONFLICT',
            'BLOCK_CONFLICT',
          ],
        },
        {
          resourceId: secondResourceId,
          reasons: ['BLOCK_CONFLICT'],
        },
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
      undefined,
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

    await expect(
      useCase.validate(input()),
    ).rejects.toBeInstanceOf(
      AvailabilityResourceNotFoundError,
    );
  });

  it('rejects an invalid excludeBookingId before Availability lookups', async () => {
    await expect(
      useCase.validate({
        ...input(),
        excludeBookingId: 'invalid',
      }),
    ).rejects.toBeInstanceOf(
      InvalidAvailabilityInputError,
    );

    expect(findBusiness).not.toHaveBeenCalled();
    expect(findResource).not.toHaveBeenCalled();
    expect(hasBooking).not.toHaveBeenCalled();
    expect(hasBlock).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        ...input(),
        resourceIds: [],
      },
      'Debe informar al menos un recurso.',
    ],
    [
      {
        ...input(),
        resourceIds: [
          firstResourceId,
          firstResourceId,
        ],
      },
      'Los recursos no pueden repetirse.',
    ],
    [
      {
        ...input(),
        resourceIds: ['invalid'],
      },
      'El identificador no es válido.',
    ],
    [
      {
        ...input(),
        resourceIds: [1] as never,
      },
      'El identificador no es válido.',
    ],
    [
      {
        ...input(),
        checkInDate: 1 as never,
      },
      'Las fechas son inválidas.',
    ],
    [
      {
        ...input(),
        checkOutDate: 1 as never,
      },
      'Las fechas son inválidas.',
    ],
    [
      {
        ...input(),
        checkInDate: '2026-02-30',
      },
      'La fecha inicial es inválida.',
    ],
    [
      {
        ...input(),
        checkInDate: '2026-03-12',
        checkOutDate: '2026-03-12',
      },
      'La fecha final debe ser posterior a la fecha inicial.',
    ],
    [
      {
        ...input(),
        checkInDate: '2026-03-13',
        checkOutDate: '2026-03-12',
      },
      'La fecha final debe ser posterior a la fecha inicial.',
    ],
  ])(
    'rejects invalid request data before Availability lookups',
    async (invalid, message) => {
      await expect(
        useCase.validate(invalid),
      ).rejects.toEqual(
        new InvalidAvailabilityInputError(message),
      );

      expect(findBusiness).not.toHaveBeenCalled();
    },
  );
});