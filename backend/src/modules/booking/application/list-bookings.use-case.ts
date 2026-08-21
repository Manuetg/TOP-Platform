import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, type BookingRepository } from '../domain/booking.repository';
import { Booking } from '../domain/booking.entity';
import { bookingStatus, requireBookingUuid } from './booking.validation';

@Injectable()
export class ListBookingsUseCase {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository) {}
  async execute(businessId: unknown, input: { status?: unknown; contactId?: unknown; resourceId?: unknown }): Promise<Booking[]> {
    const scopedBusinessId = requireBookingUuid(businessId, 'El identificador del negocio no es válido.');
    const contactId = input.contactId === undefined ? null : requireBookingUuid(input.contactId, 'El identificador del contacto no es válido.');
    const resourceId = input.resourceId === undefined ? null : requireBookingUuid(input.resourceId, 'El identificador del recurso no es válido.');
    return this.bookings.listByBusinessId(scopedBusinessId, { status: bookingStatus(input.status), contactId, resourceId });
  }
}
