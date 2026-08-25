import { BusinessStatus } from '../../business/business.contract';
import {
  BookingAvailabilityConflictError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  BookingStatus,
  InvalidBookingInputError,
} from '../../booking/booking.contract';
import { Booking } from '../../booking/domain/booking.entity';
import {
  BookingNotPendingError,
  BookingPricingRequiredError,
  InvalidBookingPricingInputError,
} from './confirm-booking.errors';
import { ConfirmBookingUseCase } from './confirm-booking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const resourceId = '44444444-4444-4444-8444-444444444444';
const secondResourceId = '55555555-5555-4555-8555-555555555555';
const ratePlanId = '66666666-6666-4666-8666-666666666666';
const secondRatePlanId = '77777777-7777-4777-8777-777777777777';

const booking = (
  values: Partial<Parameters<typeof Booking.create>[0]> = {},
) =>
  Booking.create({
    id: bookingId,
    businessId,
    status: BookingStatus.PENDING,
    contactId,
    resourceIds: [resourceId],
    checkInDate: new Date('2026-05-10'),
    checkOutDate: new Date('2026-05-12'),
    adults: null,
    children: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...values,
  });

describe('ConfirmBookingUseCase', () => {
  const findBusiness = jest.fn();
  const findContact = jest.fn();
  const findBooking = jest.fn();
  const validateAvailability = jest.fn();
  const calculatePrice = jest.fn();
  const applyManualPriceOverride = jest.fn();
  const confirm = jest.fn();

  const useCase = new ConfirmBookingUseCase(
    {
      findById: findBusiness,
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    },
    {
      findByIdAndBusinessId: findContact,
    },
    {
      create: jest.fn(),
      findByIdAndBusinessId: findBooking,
      listByBusinessId: jest.fn(),
      update: jest.fn(),
      markPending: jest.fn(),
      hasBlockingBooking: jest.fn(),
      listBlockingBookings: jest.fn(),
    },
    {
      validate: validateAvailability,
    },
    {
      execute: calculatePrice,
    } as never,
    {
      execute: applyManualPriceOverride,
    } as never,
    {
      confirm,
    },
  );

  beforeEach(() => {
    jest.resetAllMocks();

    findBusiness.mockResolvedValue({
      id: businessId,
      status: BusinessStatus.ACTIVE,
      currency: 'PYG',
    });

    findContact.mockResolvedValue({
      id: contactId,
    });

    findBooking
      .mockResolvedValueOnce(booking())
      .mockResolvedValue(
        booking({
          status: BookingStatus.CONFIRMED,
        }),
      );

    validateAvailability.mockResolvedValue({
      valid: true,
      conflicts: [],
    });

    calculatePrice.mockResolvedValue({
      businessId,
      resourceId,
      ratePlanId,
      currency: 'PYG',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      baseNightlyAmountMinor: 150000,
      nights: 2,
      breakdown: [
        {
          date: '2026-05-10',
          amountMinor: 150000,
          source: 'BASE',
        },
        {
          date: '2026-05-11',
          amountMinor: 150000,
          source: 'BASE',
        },
      ],
      totalAmountMinor: 300000,
    });

    applyManualPriceOverride.mockResolvedValue({
      businessId,
      resourceId,
      ratePlanId,
      currency: 'PYG',
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      nights: 2,
      pricingMode: 'MANUAL_OVERRIDE',
      suggestedAmountMinor: 300000,
      agreedAmountMinor: 250000,
      adjustmentAmountMinor: -50000,
      overrideReason: 'Descuento comercial',
      suggestedBreakdown: [
        {
          date: '2026-05-10',
          amountMinor: 150000,
          source: 'BASE',
        },
        {
          date: '2026-05-11',
          amountMinor: 150000,
          source: 'BASE',
        },
      ],
    });

    confirm.mockImplementation(
      async ({
        prepare,
      }: {
        prepare: () => Promise<unknown>;
      }) => {
        await prepare();
        return 'CONFIRMED';
      },
    );
  });

  it('confirms a complete PENDING Booking with calculated pricing', async () => {
    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).resolves.toMatchObject({
      id: bookingId,
      status: BookingStatus.CONFIRMED,
    });

    expect(findBusiness).toHaveBeenCalledWith(
      businessId,
    );

    expect(findBooking).toHaveBeenNthCalledWith(
      1,
      bookingId,
      businessId,
    );

    expect(findContact).toHaveBeenCalledWith(
      contactId,
      businessId,
    );

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        bookingId,
      }),
    );

    expect(validateAvailability).toHaveBeenCalledWith({
      businessId,
      resourceIds: [resourceId],
      checkInDate: '2026-05-10',
      checkOutDate: '2026-05-12',
      excludeBookingId: bookingId,
    });

    expect(calculatePrice).toHaveBeenCalledWith({
      businessId,
      resourceId,
      ratePlanId,
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
    });

    expect(applyManualPriceOverride).not.toHaveBeenCalled();

    expect(findBooking).toHaveBeenNthCalledWith(
      2,
      bookingId,
      businessId,
    );
  });

  it('builds the exact calculated Pricing Snapshot inside the confirmation transaction', async () => {
    let snapshot: unknown;

    confirm.mockImplementationOnce(
      async ({
        prepare,
      }: {
        prepare: () => Promise<unknown>;
      }) => {
        snapshot = await prepare();
        return 'CONFIRMED';
      },
    );

    await useCase.execute({
      businessId,
      bookingId,
      pricing: [
        {
          resourceId,
          ratePlanId,
        },
      ],
    });

    expect(snapshot).toEqual({
      currency: 'PYG',
      totalAmountMinor: 300000,
      items: [
        {
          resourceId,
          ratePlanId,
          pricingMode: 'CALCULATED',
          suggestedAmountMinor: 300000,
          agreedAmountMinor: 300000,
          adjustmentAmountMinor: 0,
          overrideReason: null,
          nights: 2,
          breakdown: [
            {
              date: '2026-05-10',
              amountMinor: 150000,
              source: 'BASE',
            },
            {
              date: '2026-05-11',
              amountMinor: 150000,
              source: 'BASE',
            },
          ],
        },
      ],
    });
  });

  it('uses the manual override flow when an agreed amount and reason are provided', async () => {
    let snapshot: unknown;

    confirm.mockImplementationOnce(
      async ({
        prepare,
      }: {
        prepare: () => Promise<unknown>;
      }) => {
        snapshot = await prepare();
        return 'CONFIRMED';
      },
    );

    await useCase.execute({
      businessId,
      bookingId,
      pricing: [
        {
          resourceId,
          ratePlanId,
          agreedAmountMinor: 250000,
          overrideReason: 'Descuento comercial',
        },
      ],
    });

    expect(
      applyManualPriceOverride,
    ).toHaveBeenCalledWith({
      businessId,
      resourceId,
      ratePlanId,
      checkIn: '2026-05-10',
      checkOut: '2026-05-12',
      agreedAmountMinor: 250000,
      overrideReason: 'Descuento comercial',
    });

    expect(calculatePrice).not.toHaveBeenCalled();

    expect(snapshot).toEqual({
      currency: 'PYG',
      totalAmountMinor: 250000,
      items: [
        {
          resourceId,
          ratePlanId,
          pricingMode: 'MANUAL_OVERRIDE',
          suggestedAmountMinor: 300000,
          agreedAmountMinor: 250000,
          adjustmentAmountMinor: -50000,
          overrideReason: 'Descuento comercial',
          nights: 2,
          breakdown: [
            {
              date: '2026-05-10',
              amountMinor: 150000,
              source: 'BASE',
            },
            {
              date: '2026-05-11',
              amountMinor: 150000,
              source: 'BASE',
            },
          ],
        },
      ],
    });
  });

  it('creates one pricing item per Booking Resource and sums the agreed totals', async () => {
    findBooking
      .mockReset()
      .mockResolvedValueOnce(
        booking({
          resourceIds: [
            resourceId,
            secondResourceId,
          ],
        }),
      )
      .mockResolvedValue(
        booking({
          status: BookingStatus.CONFIRMED,
          resourceIds: [
            resourceId,
            secondResourceId,
          ],
        }),
      );

    calculatePrice
      .mockResolvedValueOnce({
        businessId,
        resourceId,
        ratePlanId,
        currency: 'PYG',
        checkIn: '2026-05-10',
        checkOut: '2026-05-12',
        baseNightlyAmountMinor: 150000,
        nights: 2,
        breakdown: [],
        totalAmountMinor: 300000,
      })
      .mockResolvedValueOnce({
        businessId,
        resourceId: secondResourceId,
        ratePlanId: secondRatePlanId,
        currency: 'PYG',
        checkIn: '2026-05-10',
        checkOut: '2026-05-12',
        baseNightlyAmountMinor: 100000,
        nights: 2,
        breakdown: [],
        totalAmountMinor: 200000,
      });

    let snapshot: unknown;

    confirm.mockImplementationOnce(
      async ({
        prepare,
      }: {
        prepare: () => Promise<unknown>;
      }) => {
        snapshot = await prepare();
        return 'CONFIRMED';
      },
    );

    await useCase.execute({
      businessId,
      bookingId,
      pricing: [
        {
          resourceId,
          ratePlanId,
        },
        {
          resourceId: secondResourceId,
          ratePlanId: secondRatePlanId,
        },
      ],
    });

    expect(snapshot).toMatchObject({
      currency: 'PYG',
      totalAmountMinor: 500000,
    });

    expect(
      (snapshot as { items: unknown[] }).items,
    ).toHaveLength(2);
  });

  it('rejects missing pricing before entering the transaction', async () => {
    await expect(
      useCase.execute({
        businessId,
        bookingId,
      }),
    ).rejects.toEqual(
      new BookingPricingRequiredError(
        'La reserva requiere precios para todos sus recursos.',
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(validateAvailability).not.toHaveBeenCalled();
  });

  it('rejects pricing with a different number of Resources', async () => {
    findBooking.mockReset().mockResolvedValueOnce(
      booking({
        resourceIds: [
          resourceId,
          secondResourceId,
        ],
      }),
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new InvalidBookingPricingInputError(
        'Los precios deben corresponder exactamente a los recursos de la reserva.',
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects a pricing Resource that does not belong to the Booking', async () => {
    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId: secondResourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new InvalidBookingPricingInputError(
        'El precio contiene un recurso que no pertenece a la reserva.',
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects duplicated pricing Resources', async () => {
    findBooking.mockReset().mockResolvedValueOnce(
      booking({
        resourceIds: [
          resourceId,
          secondResourceId,
        ],
      }),
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
          {
            resourceId,
            ratePlanId: secondRatePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new InvalidBookingPricingInputError(
        'Los recursos del precio no pueden repetirse.',
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects a non-PENDING Booking before validating pricing or availability', async () => {
    findBooking.mockReset().mockResolvedValueOnce(
      booking({
        status: BookingStatus.DRAFT,
      }),
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingNotPendingError(
        'Solo se puede confirmar una reserva pendiente.',
      ),
    );

    expect(findContact).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    [
      booking({
        contactId: null,
      }),
      new BookingContactRequiredError(
        'La reserva requiere un contacto responsable.',
      ),
    ],
    [
      booking({
        resourceIds: [],
      }),
      new BookingResourcesRequiredError(
        'La reserva requiere al menos un recurso.',
      ),
    ],
    [
      booking({
        checkInDate: null,
      }),
      new BookingDatesRequiredError(
        'La reserva requiere fechas completas.',
      ),
    ],
    [
      booking({
        checkOutDate: null,
      }),
      new BookingDatesRequiredError(
        'La reserva requiere fechas completas.',
      ),
    ],
    [
      booking({
        checkInDate: new Date('2026-05-12'),
        checkOutDate: new Date('2026-05-10'),
      }),
      new InvalidBookingInputError(
        'La fecha de salida debe ser posterior a la fecha de entrada.',
      ),
    ],
  ] as const)(
    'does not enter the confirmation transaction for an invalid PENDING state',
    async (current, error) => {
      findBooking.mockReset().mockResolvedValueOnce(
        current,
      );

      await expect(
        useCase.execute({
          businessId,
          bookingId,
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        }),
      ).rejects.toEqual(error);

      expect(confirm).not.toHaveBeenCalled();
      expect(validateAvailability).not.toHaveBeenCalled();
    },
  );

  it('rejects an equal check-in and check-out date', async () => {
    findBooking.mockReset().mockResolvedValueOnce(
      booking({
        checkInDate: new Date('2026-05-10'),
        checkOutDate: new Date('2026-05-10'),
      }),
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new InvalidBookingInputError(
        'La fecha de salida debe ser posterior a la fecha de entrada.',
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects a missing or cross-tenant Contact before confirmation', async () => {
    findContact.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingContactNotFoundError(
        'El contacto no existe.',
      ),
    );

    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects an Availability conflict inside the transaction', async () => {
    validateAvailability.mockResolvedValueOnce({
      valid: false,
      conflicts: [
        {
          resourceId,
          reasons: ['BOOKING_CONFLICT'],
        },
      ],
    });

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(
      BookingAvailabilityConflictError,
    );

    expect(validateAvailability).toHaveBeenCalledWith({
      businessId,
      resourceIds: [resourceId],
      checkInDate: '2026-05-10',
      checkOutDate: '2026-05-12',
      excludeBookingId: bookingId,
    });

    expect(calculatePrice).not.toHaveBeenCalled();
  });

  it('maps NOT_FOUND returned after locking to BookingNotFoundError', async () => {
    confirm.mockResolvedValueOnce('NOT_FOUND');

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingNotFoundError(
        'La reserva no existe.',
      ),
    );
  });

  it('maps NOT_PENDING returned after locking to BookingNotPendingError', async () => {
    confirm.mockResolvedValueOnce('NOT_PENDING');

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingNotPendingError(
        'Solo se puede confirmar una reserva pendiente.',
      ),
    );
  });

  it('hides a missing or cross-tenant Booking before confirmation', async () => {
    findBooking.mockReset().mockResolvedValueOnce(
      null,
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingNotFoundError(
        'La reserva no existe.',
      ),
    );

    expect(findContact).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects a missing business before reading the Booking', async () => {
    findBusiness.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingBusinessNotFoundError(
        'El negocio no existe.',
      ),
    );

    expect(findBooking).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('rejects an inactive business before reading the Booking', async () => {
    findBusiness.mockResolvedValueOnce({
      status: BusinessStatus.ARCHIVED,
    });

    await expect(
      useCase.execute({
        businessId,
        bookingId,
        pricing: [
          {
            resourceId,
            ratePlanId,
          },
        ],
      }),
    ).rejects.toEqual(
      new BookingBusinessUnavailableError(
        'El negocio no está activo.',
      ),
    );

    expect(findBooking).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('validates identifiers before reading or confirming a Booking', async () => {
    await expect(
      useCase.execute({
        businessId: 'invalid',
        bookingId,
        pricing: [],
      }),
    ).rejects.toBeInstanceOf(
      InvalidBookingInputError,
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId: 'invalid',
        pricing: [],
      }),
    ).rejects.toBeInstanceOf(
      InvalidBookingInputError,
    );

    expect(findBusiness).not.toHaveBeenCalled();
    expect(findBooking).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});