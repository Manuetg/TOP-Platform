import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, type BookingRepository } from '../domain/booking.repository';
import { Booking } from '../domain/booking.entity';
import { BookingNotFoundError } from './booking.errors';
import { requireBookingUuid } from './booking.validation';

@Injectable()
export class GetBookingUseCase {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) {}
  async execute(businessId: unknown, bookingId: unknown): Promise<Booking> {
    const scopedBusinessId = requireBookingUuid(businessId, 'El identificador del negocio no es válido.');
    const scopedBookingId = requireBookingUuid(bookingId, 'El identificador de la reserva no es válido.');
    const booking = await this.bookings.findByIdAndBusinessId(scopedBookingId, scopedBusinessId);
    if (!booking) throw new BookingNotFoundError('La reserva no existe.');
    return booking;
  }
}
