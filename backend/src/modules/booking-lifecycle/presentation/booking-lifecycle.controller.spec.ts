import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingAvailabilityConflictError,
  BookingCancellationNotAllowedError,
  BookingNotFoundError,
  BookingStatus,
} from '../../booking/booking.contract';
import { Booking } from '../../booking/domain/booking.entity';
import {
  CalculatePriceRatePlanNotFoundError,
  InvalidCalculatePriceInputError,
} from '../../pricing/application/calculate-price.errors';
import {
  BookingNotPendingError,
  InvalidBookingPricingInputError,
} from '../application/confirm-booking.errors';
import { BookingLifecycleController } from './booking-lifecycle.controller';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const ratePlanId = '44444444-4444-4444-8444-444444444444';

const booking = Booking.create({
  id: bookingId,
  businessId,
  status: BookingStatus.PENDING,
  contactId: null,
  resourceIds: [],
  checkInDate: null,
  checkOutDate: null,
  adults: null,
  children: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('BookingLifecycleController', () => {
  const submit = {
    execute: jest.fn(),
  };

  const confirm = {
    execute: jest.fn(),
  };

  const cancel = {
    execute: jest.fn(),
  };

  const controller =
    new BookingLifecycleController(
      submit as never,
      confirm as never,
      cancel as never,
    );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('delegates submit and returns the public Booking DTO', async () => {
    submit.execute.mockResolvedValueOnce(
      booking,
    );

    await expect(
      controller.submit(
        businessId,
        bookingId,
      ),
    ).resolves.toMatchObject({
      id: bookingId,
      status: BookingStatus.PENDING,
      resourceIds: [],
    });

    expect(
      submit.execute,
    ).toHaveBeenCalledWith({
      businessId,
      bookingId,
    });
  });

  it('maps submit availability conflicts to HTTP 409', async () => {
    submit.execute.mockRejectedValueOnce(
      new BookingAvailabilityConflictError(
        'conflict',
      ),
    );

    await expect(
      controller.submit(
        businessId,
        bookingId,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('delegates confirm pricing and returns the public Booking DTO', async () => {
    const confirmed = Booking.create({
      id: bookingId,
      businessId,
      status: BookingStatus.CONFIRMED,
      contactId: null,
      resourceIds: [resourceId],
      checkInDate:
        new Date('2026-05-10'),
      checkOutDate:
        new Date('2026-05-12'),
      adults: null,
      children: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    confirm.execute.mockResolvedValueOnce(
      confirmed,
    );

    const body = {
      pricing: [
        {
          resourceId,
          ratePlanId,
        },
      ],
    };

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        body,
      ),
    ).resolves.toMatchObject({
      id: bookingId,
      status: BookingStatus.CONFIRMED,
      resourceIds: [resourceId],
    });

    expect(
      confirm.execute,
    ).toHaveBeenCalledWith({
      businessId,
      bookingId,
      pricing: body.pricing,
    });
  });

  it('maps invalid Booking pricing to HTTP 400', async () => {
    confirm.execute.mockRejectedValueOnce(
      new InvalidBookingPricingInputError(
        'invalid pricing',
      ),
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps invalid calculated pricing input to HTTP 400', async () => {
    confirm.execute.mockRejectedValueOnce(
      new InvalidCalculatePriceInputError(
        'invalid pricing',
      ),
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps a missing Booking to HTTP 404', async () => {
    confirm.execute.mockRejectedValueOnce(
      new BookingNotFoundError(
        'La reserva no existe.',
      ),
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps a missing RatePlan to HTTP 404', async () => {
    confirm.execute.mockRejectedValueOnce(
      new CalculatePriceRatePlanNotFoundError(
        'La tarifa no existe.',
      ),
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps a non-PENDING Booking to HTTP 409', async () => {
    confirm.execute.mockRejectedValueOnce(
      new BookingNotPendingError(
        'Solo se puede confirmar una reserva pendiente.',
      ),
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps confirm availability conflicts to HTTP 409', async () => {
    confirm.execute.mockRejectedValueOnce(
      new BookingAvailabilityConflictError(
        'conflict',
      ),
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('propagates unknown errors', async () => {
    const error =
      new Error('unexpected');

    confirm.execute.mockRejectedValueOnce(
      error,
    );

    await expect(
      controller.confirm(
        businessId,
        bookingId,
        {
          pricing: [
            {
              resourceId,
              ratePlanId,
            },
          ],
        },
      ),
    ).rejects.toBe(error);
  });

  it('delegates cancellation and maps invalid lifecycle states to HTTP 409', async () => {
    cancel.execute.mockResolvedValueOnce(
      booking.withStatus(BookingStatus.CANCELLED),
    );
    await expect(controller.cancel(businessId, bookingId)).resolves.toMatchObject({ status: BookingStatus.CANCELLED });
    expect(cancel.execute).toHaveBeenCalledWith({ businessId, bookingId });
    cancel.execute.mockRejectedValueOnce(new BookingCancellationNotAllowedError('invalid'));
    await expect(controller.cancel(businessId, bookingId)).rejects.toBeInstanceOf(ConflictException);
  });
  it('forwards the optional cancellation reason and authenticated actor',async()=>{const actorUserId='55555555-5555-4555-8555-555555555555';cancel.execute.mockResolvedValueOnce(booking.withStatus(BookingStatus.CANCELLED));await controller.cancel(businessId,bookingId,{reason:'Cambio de planes.'},{authenticatedPrincipal:{userId:actorUserId}} as never);expect(cancel.execute).toHaveBeenCalledWith({businessId,bookingId,actorUserId,reason:'Cambio de planes.'});});
});
