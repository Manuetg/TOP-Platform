import { PrepareManualPriceUseCase } from '../../pricing/application/prepare-manual-price.use-case';
import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_OVERBOOKING_VALIDATOR,
  type AvailabilityOverbookingValidator,
} from '../../availability/availability.contract';
import {
  BOOKING_REPOSITORY,
  BookingAvailabilityConflictError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotFoundError,
  BookingResourcesRequiredError,
  BookingStatus,
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
import {
  CONTACT_LOOKUP,
  type ContactLookup,
} from '../../contact/contact.contract';
import { ApplyManualPriceOverrideUseCase } from '../../pricing/application/apply-manual-price-override.use-case';
import { CalculatePriceUseCase } from '../../pricing/application/calculate-price.use-case';
import {
  BOOKING_CONFIRMATION_TRANSACTION,
  type BookingConfirmationTransaction,
} from '../booking-confirmation.contract';
import { PrepareBookingPricing } from './prepare-booking-pricing';
import {
  BookingNotPendingError,
  BookingPaymentRequiredError,
} from './confirm-booking.errors';

export interface ConfirmBookingInput {
  businessId: unknown;
  bookingId: unknown;
  pricing?: unknown;
  actorUserId?: unknown;
}

@Injectable()
export class ConfirmBookingUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY)
    private readonly businesses: BusinessRepository,
    @Inject(CONTACT_LOOKUP)
    private readonly contacts: ContactLookup,
    @Inject(BOOKING_REPOSITORY)
    private readonly bookings: BookingRepository,
    @Inject(AVAILABILITY_OVERBOOKING_VALIDATOR)
    private readonly availability: AvailabilityOverbookingValidator,
    private readonly calculatePrice: CalculatePriceUseCase,
    private readonly applyManualPriceOverride:
      ApplyManualPriceOverrideUseCase,
    @Inject(BOOKING_CONFIRMATION_TRANSACTION)
    private readonly confirmation:
      BookingConfirmationTransaction,
    private readonly prepareManualPrice: PrepareManualPriceUseCase,
  ) {}

  async execute(
    input: ConfirmBookingInput,
  ): Promise<Booking> {
    const businessId = requireBookingUuid(
      input.businessId,
      'El identificador del negocio no es válido.',
    );

    const bookingId = requireBookingUuid(
      input.bookingId,
      'El identificador de la reserva no es válido.',
    );
    const actorUserId = input.actorUserId === undefined ? null : requireBookingUuid(input.actorUserId, 'El identificador del actor no es válido.');

    await this.activeBusiness(businessId);

    const booking =
      await this.bookings.findByIdAndBusinessId(
        bookingId,
        businessId,
      );

    if (!booking) {
      throw new BookingNotFoundError(
        'La reserva no existe.',
      );
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BookingNotPendingError(
        'Solo se puede confirmar una reserva pendiente.',
      );
    }

    const range = await this.validateBooking(
      booking,
      businessId,
    );

    const pricing = new PrepareBookingPricing(this.calculatePrice, this.applyManualPriceOverride, this.prepareManualPrice);
    pricing.validate(input.pricing, booking.resourceIds);

    const result = await this.confirmation.confirm({
      businessId,
      bookingId,
      actorUserId,
      prepare: async () => {
        const availability =
          await this.availability.validate({
            businessId,
            resourceIds: booking.resourceIds,
            checkInDate: range.checkInDate.toISOString().slice(0, 10),
            checkOutDate: range.checkOutDate.toISOString().slice(0, 10),
            excludeBookingId: booking.id,
          });

        if (!availability.valid) {
          throw new BookingAvailabilityConflictError(
            'La reserva tiene conflictos de disponibilidad.',
          );
        }

        return pricing.execute(businessId, range, booking.resourceIds, input.pricing);
      },
    });

    if (result === 'NOT_FOUND') {
      throw new BookingNotFoundError(
        'La reserva no existe.',
      );
    }

    if (result === 'NOT_PENDING') {
      throw new BookingNotPendingError(
        'Solo se puede confirmar una reserva pendiente.',
      );
    }

    if (result === 'PAYMENT_REQUIRED') {
      throw new BookingPaymentRequiredError('La reserva tiene precio acordado; se confirma al registrar un pago positivo.');
    }

    const confirmed =
      await this.bookings.findByIdAndBusinessId(
        bookingId,
        businessId,
      );

    if (!confirmed) {
      throw new BookingNotFoundError(
        'La reserva no existe.',
      );
    }

    return confirmed;
  }

  private async activeBusiness(
    businessId: string,
  ): Promise<void> {
    const business =
      await this.businesses.findById(
        businessId,
      );

    if (!business) {
      throw new BookingBusinessNotFoundError(
        'El negocio no existe.',
      );
    }

    if (
      business.status !== BusinessStatus.ACTIVE
    ) {
      throw new BookingBusinessUnavailableError(
        'El negocio no está activo.',
      );
    }
  }

  private async validateBooking(
    booking: Booking,
    businessId: string,
  ): Promise<{
    checkInDate: Date;
    checkOutDate: Date;
  }> {
    if (!booking.contactId) {
      throw new BookingContactRequiredError(
        'La reserva requiere un contacto responsable.',
      );
    }

    const contact =
      await this.contacts.findByIdAndBusinessId(
        booking.contactId,
        businessId,
      );

    if (!contact) {
      throw new BookingContactNotFoundError(
        'El contacto no existe.',
      );
    }

    if (booking.resourceIds.length === 0) {
      throw new BookingResourcesRequiredError(
        'La reserva requiere al menos un recurso.',
      );
    }

    if (
      !booking.checkInDate ||
      !booking.checkOutDate
    ) {
      throw new BookingDatesRequiredError(
        'La reserva requiere fechas completas.',
      );
    }

    if (
      booking.checkOutDate <=
      booking.checkInDate
    ) {
      throw new InvalidBookingInputError(
        'La fecha de salida debe ser posterior a la fecha de entrada.',
      );
    }

    return {
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
    };
  }

}
