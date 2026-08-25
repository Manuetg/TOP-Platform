import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_OVERBOOKING_VALIDATOR,
  type AvailabilityOverbookingValidator,
} from '../../availability/availability.contract';
import {
  BUSINESS_REPOSITORY,
  type BusinessRepository,
} from '../../business/business.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import {
  RESOURCE_REPOSITORY,
  type ResourceRepository,
} from '../../resource/resource.contract';
import { BookingStatus } from '../domain/booking-status.enum';
import { BOOKING_REPOSITORY, type BookingRepository } from '../domain/booking.repository';
import {
  BookingAvailabilityConflictError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotDraftError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  InvalidBookingInputError,
} from './booking.errors';
import { BookingBase } from './booking.base';
import { requireBookingUuid } from './booking.validation';
import type { Booking } from '../domain/booking.entity';

export interface SubmitBookingInput {
  businessId: unknown;
  bookingId: unknown;
}

@Injectable()
export class SubmitBookingUseCase extends BookingBase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) businesses: BusinessRepository,
    @Inject(CONTACT_LOOKUP) contacts: ContactLookup,
    @Inject(RESOURCE_REPOSITORY) resources: ResourceRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(AVAILABILITY_OVERBOOKING_VALIDATOR)
    private readonly availability: AvailabilityOverbookingValidator,
  ) {
    super(businesses, contacts, resources);
  }

  async execute(input: SubmitBookingInput): Promise<Booking> {
    const businessId = requireBookingUuid(
      input.businessId,
      'El identificador del negocio no es válido.',
    );
    const bookingId = requireBookingUuid(
      input.bookingId,
      'El identificador de la reserva no es válido.',
    );
    await this.activeBusiness(businessId);

    const booking = await this.bookings.findByIdAndBusinessId(
      bookingId,
      businessId,
    );
    if (!booking) {
      throw new BookingNotFoundError('La reserva no existe.');
    }
    if (booking.status !== BookingStatus.DRAFT) {
      throw new BookingNotDraftError(
        'Solo se puede enviar una reserva en borrador.',
      );
    }

    const range = await this.validateSubmission(booking, businessId);
    const result = await this.availability.validate({
      businessId,
      resourceIds: booking.resourceIds,
      checkInDate: this.date(range.checkInDate),
      checkOutDate: this.date(range.checkOutDate),
    });
    if (!result.valid) {
      throw new BookingAvailabilityConflictError(
        'La reserva tiene conflictos de disponibilidad.',
      );
    }
    return this.bookings.markPending(booking.id);
  }

  private async validateSubmission(
    booking: Booking,
    businessId: string,
  ): Promise<{ checkInDate: Date; checkOutDate: Date }> {
    if (!booking.contactId) {
      throw new BookingContactRequiredError(
        'La reserva requiere un contacto responsable.',
      );
    }
    await this.validateContact(businessId, booking.contactId);
    if (booking.resourceIds.length === 0) {
      throw new BookingResourcesRequiredError(
        'La reserva requiere al menos un recurso.',
      );
    }
    if (!booking.checkInDate || !booking.checkOutDate) {
      throw new BookingDatesRequiredError(
        'La reserva requiere fechas completas.',
      );
    }
    if (booking.checkOutDate <= booking.checkInDate) {
      throw new InvalidBookingInputError(
        'La fecha de salida debe ser posterior a la fecha de entrada.',
      );
    }
    return {
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
    };
  }

  private date(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
