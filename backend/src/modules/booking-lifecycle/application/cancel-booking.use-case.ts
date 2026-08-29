import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_REPOSITORY,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingCancellationNotAllowedError,
  BookingNotFoundError,
  BookingStatus,
  BookingTimelineEventType,
  InvalidBookingInputError,
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

  async execute(input: { businessId: unknown; bookingId: unknown; actorUserId?: unknown; reason?: unknown }): Promise<Booking> {
    const businessId = requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.');
    const bookingId = requireBookingUuid(input.bookingId, 'El identificador de la reserva no es válido.');
    const actorUserId = input.actorUserId === undefined ? null : requireBookingUuid(input.actorUserId, 'El identificador del actor no es válido.');
    const reason = this.reason(input.reason);
    const business = await this.businesses.findById(businessId);
    if (!business) throw new BookingBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new BookingBusinessUnavailableError('El negocio no está activo.');
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, businessId);
    if (!booking) throw new BookingNotFoundError('La reserva no existe.');
    if (booking.status === BookingStatus.CANCELLED) {
      await this.bookings.appendTimelineEvent({ businessId, bookingId, type: BookingTimelineEventType.BOOKING_CANCELLED, actorUserId, ...(reason ? { reason } : {}) });
      return booking;
    }
    if (![BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
      throw new BookingCancellationNotAllowedError('No se puede cancelar una reserva en este estado.');
    }
    return this.bookings.markCancelled(booking.id, businessId, actorUserId, reason);
  }

  private reason(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new InvalidBookingInputError('El motivo de cancelación no es válido.');
    const reason = value.trim();
    if (reason.length < 2 || reason.length > 500) throw new InvalidBookingInputError('El motivo de cancelación debe tener entre 2 y 500 caracteres.');
    return reason;
  }
}
