import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Booking, BookingNotFoundError, BookingStatus, InvalidBookingInputError } from '../../booking/booking.contract';
import { Capability } from '../../../shared/application/authorization-policy';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { BUSINESS_ACCESS_KEY } from '../../../shared/security/security.decorators';
import { BookingOperation } from '../booking-operation.contract';
import { BookingOperationConflictError, BookingOperationForbiddenError } from '../application/booking-operation.errors';
import { BookingOperationsController } from './booking-operations.controller';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const expectedUpdatedAt = '2026-10-02T12:00:00.123Z';
const request = { authenticatedPrincipal: { userId: actorUserId } } as AuthenticatedRequest;
const booking = Booking.create({ id: bookingId, businessId, status: BookingStatus.IN_PROGRESS, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(expectedUpdatedAt), updatedAt: new Date(expectedUpdatedAt) });

describe('BookingOperationsController', () => {
  const execute = jest.fn();
  const controller = new BookingOperationsController({ execute } as never);
  beforeEach(() => jest.resetAllMocks());

  it.each([
    ['checkIn', BookingOperation.CHECK_IN], ['checkOut', BookingOperation.CHECK_OUT],
    ['noShow', BookingOperation.NO_SHOW], ['confirmWithoutPayment', BookingOperation.CONFIRM_WITHOUT_PAYMENT],
  ] as const)('delegates %s with actor from the authenticated principal', async (method, operation) => {
    execute.mockResolvedValue(booking);
    await expect(controller[method](businessId, bookingId, { expectedUpdatedAt, reason: 'Acción manual' }, request)).resolves.toMatchObject({ id: bookingId, businessId, status: BookingStatus.IN_PROGRESS });
    expect(execute).toHaveBeenCalledWith({ businessId, bookingId, operation, actorUserId, expectedUpdatedAt, reason: 'Acción manual' });
  });

  it('requires the existing tenant booking.write capability for every new operation', () => {
    const metadata = Reflect.getMetadata(BUSINESS_ACCESS_KEY, BookingOperationsController) as unknown;
    expect(metadata).toEqual({ parameter: 'businessId', capabilities: [Capability.BOOKING_WRITE] });
  });

  it.each([
    [new InvalidBookingInputError('invalid'), BadRequestException],
    [new BookingNotFoundError('not found'), NotFoundException],
    [new BookingOperationForbiddenError('forbidden'), ForbiddenException],
    [new BookingOperationConflictError('stale'), ConflictException],
  ])('maps the domain failure %p to its HTTP status', async (failure, status) => {
    execute.mockRejectedValue(failure);
    await expect(controller.checkIn(businessId, bookingId, { expectedUpdatedAt }, request)).rejects.toBeInstanceOf(status);
  });
});
