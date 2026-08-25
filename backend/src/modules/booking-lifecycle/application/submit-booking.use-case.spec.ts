import { BusinessStatus } from '../../business/business.contract';
import {
  BookingAvailabilityConflictError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotDraftError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  BookingStatus,
  InvalidBookingInputError,
} from '../../booking/booking.contract';
import { Booking } from '../../booking/domain/booking.entity';
import { SubmitBookingUseCase } from './submit-booking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const resourceId = '44444444-4444-4444-8444-444444444444';

const booking = (
  values: Partial<Parameters<typeof Booking.create>[0]> = {},
) =>
  Booking.create({
    id: bookingId,
    businessId,
    status: BookingStatus.DRAFT,
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

describe('SubmitBookingUseCase', () => {
  const findBusiness = jest.fn();
  const findContact = jest.fn();
  const findBooking = jest.fn();
  const markPending = jest.fn();
  const validate = jest.fn();

  const useCase = new SubmitBookingUseCase(
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
      markPending,
      hasBlockingBooking: jest.fn(),
      listBlockingBookings: jest.fn(),
    },
    {
      validate,
    },
  );

  beforeEach(() => {
    jest.resetAllMocks();

    findBusiness.mockResolvedValue({
      status: BusinessStatus.ACTIVE,
    });

    findContact.mockResolvedValue({
      id: contactId,
    });

    findBooking.mockResolvedValue(booking());

    validate.mockResolvedValue({
      valid: true,
      conflicts: [],
    });

    markPending.mockResolvedValue(
      booking({
        status: BookingStatus.PENDING,
      }),
    );
  });

  it('submits a complete Draft after exact Availability validation', async () => {
    await expect(
      useCase.execute({
        businessId,
        bookingId,
      }),
    ).resolves.toMatchObject({
      id: bookingId,
      status: BookingStatus.PENDING,
    });

    expect(validate).toHaveBeenCalledWith({
      businessId,
      resourceIds: [resourceId],
      checkInDate: '2026-05-10',
      checkOutDate: '2026-05-12',
    });

    expect(markPending).toHaveBeenCalledWith(bookingId);
  });

  it.each([
    [booking({ contactId: null }), BookingContactRequiredError],
    [booking({ resourceIds: [] }), BookingResourcesRequiredError],
    [booking({ checkInDate: null }), BookingDatesRequiredError],
    [booking({ checkOutDate: null }), BookingDatesRequiredError],
    [
      booking({
        checkInDate: new Date('2026-05-12'),
        checkOutDate: new Date('2026-05-10'),
      }),
      InvalidBookingInputError,
    ],
    [
      booking({
        status: BookingStatus.PENDING,
      }),
      BookingNotDraftError,
    ],
  ] as const)(
    'does not persist an invalid Draft state',
    async (current, error) => {
      findBooking.mockResolvedValueOnce(current);

      await expect(
        useCase.execute({
          businessId,
          bookingId,
        }),
      ).rejects.toBeInstanceOf(error);

      expect(validate).not.toHaveBeenCalled();
      expect(markPending).not.toHaveBeenCalled();
    },
  );

  it('hides a missing or cross-tenant Booking and does not persist', async () => {
    findBooking.mockResolvedValueOnce(null);

    await expect(
      useCase.execute({
        businessId,
        bookingId,
      }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);

    expect(findBooking).toHaveBeenCalledWith(
      bookingId,
      businessId,
    );

    expect(markPending).not.toHaveBeenCalled();
  });

  it('rejects Availability conflicts without changing the Booking status', async () => {
    validate.mockResolvedValueOnce({
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
      }),
    ).rejects.toBeInstanceOf(
      BookingAvailabilityConflictError,
    );

    expect(markPending).not.toHaveBeenCalled();
  });

  it('validates identifiers before reading or persisting a Booking', async () => {
    await expect(
      useCase.execute({
        businessId: 'invalid',
        bookingId,
      }),
    ).rejects.toBeInstanceOf(
      InvalidBookingInputError,
    );

    await expect(
      useCase.execute({
        businessId,
        bookingId: 'invalid',
      }),
    ).rejects.toBeInstanceOf(
      InvalidBookingInputError,
    );

    expect(findBusiness).not.toHaveBeenCalled();
    expect(markPending).not.toHaveBeenCalled();
  });
});