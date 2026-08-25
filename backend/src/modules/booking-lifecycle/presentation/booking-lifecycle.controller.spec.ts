import { ConflictException } from '@nestjs/common';
import { BookingAvailabilityConflictError, BookingStatus } from '../../booking/booking.contract';
import { Booking } from '../../booking/domain/booking.entity';
import { BookingLifecycleController } from './booking-lifecycle.controller';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const booking = Booking.create({ id: bookingId, businessId, status: BookingStatus.PENDING, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });

describe('BookingLifecycleController', () => {
  const submit = { execute: jest.fn() };
  const controller = new BookingLifecycleController(submit as never);
  beforeEach(() => jest.resetAllMocks());
  it('delegates submit and returns the public Booking DTO', async () => { submit.execute.mockResolvedValueOnce(booking); await expect(controller.submit(businessId, bookingId)).resolves.toMatchObject({ id: bookingId, status: BookingStatus.PENDING, resourceIds: [] }); expect(submit.execute).toHaveBeenCalledWith({ businessId, bookingId }); });
  it('maps availability conflicts to HTTP 409', async () => { submit.execute.mockRejectedValueOnce(new BookingAvailabilityConflictError('conflict')); await expect(controller.submit(businessId, bookingId)).rejects.toBeInstanceOf(ConflictException); });
});
