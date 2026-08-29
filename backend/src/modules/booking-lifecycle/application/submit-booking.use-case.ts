import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_OVERBOOKING_VALIDATOR,
  type AvailabilityOverbookingValidator,
} from '../../availability/availability.contract';
import {
  BUSINESS_REPOSITORY,
  BusinessStatus,
  type BusinessRepository,
} from '../../business/business.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import {
  BOOKING_REPOSITORY,
  BookingAvailabilityConflictError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotDraftError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  BookingStatus,
  InvalidBookingInputError,
  requireBookingUuid,
  type Booking,
  type BookingRepository,
} from '../../booking/booking.contract';

export interface SubmitBookingInput {
  businessId: unknown;
  bookingId: unknown;
  actorUserId?: unknown;
}

@Injectable()
export class SubmitBookingUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(CONTACT_LOOKUP) private readonly contacts: ContactLookup,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(AVAILABILITY_OVERBOOKING_VALIDATOR)
    private readonly availability: AvailabilityOverbookingValidator,
  ) {}

  async execute(input: SubmitBookingInput): Promise<Booking> {
    const businessId = requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.');
    const bookingId = requireBookingUuid(input.bookingId, 'El identificador de la reserva no es válido.');
    await this.activeBusiness(businessId);
    const booking = await this.bookings.findByIdAndBusinessId(bookingId, businessId);
    if (!booking) throw new BookingNotFoundError('La reserva no existe.');
    if (booking.status !== BookingStatus.DRAFT) throw new BookingNotDraftError('Solo se puede enviar una reserva en borrador.');

    const range = await this.validateSubmission(booking, businessId);
    const result = await this.availability.validate({
      businessId,
      resourceIds: booking.resourceIds,
      checkInDate: this.date(range.checkInDate),
      checkOutDate: this.date(range.checkOutDate),
    });
    if (!result.valid) throw new BookingAvailabilityConflictError('La reserva tiene conflictos de disponibilidad.');
    const actorUserId = input.actorUserId === undefined ? null : requireBookingUuid(input.actorUserId, 'El identificador del actor no es válido.');
    const pending = await this.bookings.markPending(booking.id, businessId, actorUserId);
    if (!pending) throw new BookingNotDraftError('Solo se puede enviar una reserva en borrador.');
    return pending;
  }

  private async activeBusiness(businessId: string): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new BookingBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new BookingBusinessUnavailableError('El negocio no está activo.');
  }

  private async validateSubmission(booking: Booking, businessId: string): Promise<{ checkInDate: Date; checkOutDate: Date }> {
    if (!booking.contactId) throw new BookingContactRequiredError('La reserva requiere un contacto responsable.');
    if (!(await this.contacts.findByIdAndBusinessId(booking.contactId, businessId))) throw new BookingContactNotFoundError('El contacto no existe.');
    if (booking.resourceIds.length === 0) throw new BookingResourcesRequiredError('La reserva requiere al menos un recurso.');
    if (!booking.checkInDate || !booking.checkOutDate) throw new BookingDatesRequiredError('La reserva requiere fechas completas.');
    if (booking.checkOutDate <= booking.checkInDate) throw new InvalidBookingInputError('La fecha de salida debe ser posterior a la fecha de entrada.');
    return { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate };
  }

  private date(value: Date): string { return value.toISOString().slice(0, 10); }
}
