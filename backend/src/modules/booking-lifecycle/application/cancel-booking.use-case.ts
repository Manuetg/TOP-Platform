import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_REPOSITORY,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingCancellationNotAllowedError,
  BookingNotFoundError,
  BookingStatus,
  requireBookingUuid,
  type Booking,
  type BookingRepository,
} from '../../booking/booking.contract';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
  type BusinessRepository,
} from '../../business/business.contract';

@Injectable()
export class CancelBookingUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
  ) {}

  async execute(input: { businessId: unknown; bookingId: unknown }): Promise<Booking> {
    const businessId = requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.');
    const bookingId = requireBookingUuid(input.bookingId, 'El identificador de la reserva no es válido.');
    const business = await this.businesses.findById(businessId);
    if (!business) throw new BookingBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new BookingBusinessUnavailableError('El negocio no está activo.');
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, businessId);
    if (!booking) throw new BookingNotFoundError('La reserva no existe.');
    if (booking.status === BookingStatus.CANCELLED) return booking;
    if (![BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
      throw new BookingCancellationNotAllowedError('No se puede cancelar una reserva en este estado.');
    }
    return this.bookings.markCancelled(booking.id);
  }
}
