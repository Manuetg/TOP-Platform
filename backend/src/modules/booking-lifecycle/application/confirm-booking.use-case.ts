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
import type { PricingSnapshotItem } from '../../pricing/domain/pricing-snapshot.repository';
import {
  BOOKING_CONFIRMATION_TRANSACTION,
  type BookingConfirmationSnapshotData,
  type BookingConfirmationTransaction,
} from '../booking-confirmation.contract';
import {
  BookingNotPendingError,
  BookingPricingRequiredError,
  InvalidBookingPricingInputError,
} from './confirm-booking.errors';

export interface ConfirmBookingInput {
  businessId: unknown;
  bookingId: unknown;
  pricing?: unknown;
}

interface ConfirmBookingPricingInput {
  resourceId: string;
  ratePlanId: string;
  agreedAmountMinor?: unknown;
  overrideReason?: unknown;
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

    const pricing = this.validatePricing(
      input.pricing,
      booking.resourceIds,
    );

    const result = await this.confirmation.confirm({
      businessId,
      bookingId,
      prepare: async () => {
        const availability =
          await this.availability.validate({
            businessId,
            resourceIds: booking.resourceIds,
            checkInDate: this.date(
              range.checkInDate,
            ),
            checkOutDate: this.date(
              range.checkOutDate,
            ),
            excludeBookingId: booking.id,
          });

        if (!availability.valid) {
          throw new BookingAvailabilityConflictError(
            'La reserva tiene conflictos de disponibilidad.',
          );
        }

        return this.prepareSnapshot(
          businessId,
          range,
          pricing,
        );
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

  private validatePricing(
    value: unknown,
    resourceIds: string[],
  ): ConfirmBookingPricingInput[] {
    if (
      !Array.isArray(value) ||
      value.length === 0
    ) {
      throw new BookingPricingRequiredError(
        'La reserva requiere precios para todos sus recursos.',
      );
    }

    if (value.length !== resourceIds.length) {
      throw new InvalidBookingPricingInputError(
        'Los precios deben corresponder exactamente a los recursos de la reserva.',
      );
    }

    const expectedResources =
      new Set(resourceIds);

    const receivedResources =
      new Set<string>();

    const pricing =
      value.map((item) =>
        this.validatePricingItem(
          item,
          expectedResources,
          receivedResources,
        ),
      );

    if (
      receivedResources.size !==
      expectedResources.size
    ) {
      throw new InvalidBookingPricingInputError(
        'Los precios deben corresponder exactamente a los recursos de la reserva.',
      );
    }

    return pricing;
  }

  private validatePricingItem(
    value: unknown,
    expectedResources: Set<string>,
    receivedResources: Set<string>,
  ): ConfirmBookingPricingInput {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value)
    ) {
      throw new InvalidBookingPricingInputError(
        'El precio del recurso es inválido.',
      );
    }

    const item =
      value as Record<string, unknown>;

    const resourceId = requireBookingUuid(
      item.resourceId,
      'El identificador del recurso no es válido.',
    );

    const ratePlanId = requireBookingUuid(
      item.ratePlanId,
      'El identificador de la tarifa no es válido.',
    );

    if (!expectedResources.has(resourceId)) {
      throw new InvalidBookingPricingInputError(
        'El precio contiene un recurso que no pertenece a la reserva.',
      );
    }

    if (receivedResources.has(resourceId)) {
      throw new InvalidBookingPricingInputError(
        'Los recursos del precio no pueden repetirse.',
      );
    }

    receivedResources.add(resourceId);

    return {
      resourceId,
      ratePlanId,
      agreedAmountMinor:
        item.agreedAmountMinor,
      overrideReason:
        item.overrideReason,
    };
  }

  private async prepareSnapshot(
    businessId: string,
    range: {
      checkInDate: Date;
      checkOutDate: Date;
    },
    pricing: ConfirmBookingPricingInput[],
  ): Promise<BookingConfirmationSnapshotData> {
    const items = await Promise.all(
      pricing.map((item) =>
        this.preparePricingItem(
          businessId,
          range,
          item,
        ),
      ),
    );

    const currencies =
      new Set(
        items.map(
          ({ currency }) => currency,
        ),
      );

    if (currencies.size !== 1) {
      throw new InvalidBookingPricingInputError(
        'Los precios de la reserva deben usar la misma moneda.',
      );
    }

    const totalAmountMinor =
      items.reduce(
        (total, item) =>
          total +
          item.snapshot.agreedAmountMinor,
        0,
      );

    if (
      !Number.isSafeInteger(
        totalAmountMinor,
      ) ||
      totalAmountMinor < 0
    ) {
      throw new InvalidBookingPricingInputError(
        'El importe total de la reserva no es válido.',
      );
    }

    return {
      currency: items[0].currency,
      totalAmountMinor,
      items: items.map(
        ({ snapshot }) => snapshot,
      ),
    };
  }

  private async preparePricingItem(
    businessId: string,
    range: {
      checkInDate: Date;
      checkOutDate: Date;
    },
    item: ConfirmBookingPricingInput,
  ): Promise<{
    currency: string;
    snapshot: PricingSnapshotItem;
  }> {
    const checkIn = this.date(
      range.checkInDate,
    );

    const checkOut = this.date(
      range.checkOutDate,
    );

    const hasManualOverride =
      item.agreedAmountMinor !== undefined ||
      item.overrideReason !== undefined;

    if (hasManualOverride) {
      const result =
        await this.applyManualPriceOverride.execute({
          businessId,
          resourceId: item.resourceId,
          ratePlanId: item.ratePlanId,
          checkIn,
          checkOut,
          agreedAmountMinor:
            item.agreedAmountMinor,
          overrideReason:
            item.overrideReason,
        });

      return {
        currency: result.currency,
        snapshot: {
          resourceId: result.resourceId,
          ratePlanId: result.ratePlanId,
          pricingMode:
            result.pricingMode,
          suggestedAmountMinor:
            result.suggestedAmountMinor,
          agreedAmountMinor:
            result.agreedAmountMinor,
          adjustmentAmountMinor:
            result.adjustmentAmountMinor,
          overrideReason:
            result.overrideReason,
          nights: result.nights,
          breakdown:
            result.suggestedBreakdown,
        },
      };
    }

    const result =
      await this.calculatePrice.execute({
        businessId,
        resourceId: item.resourceId,
        ratePlanId: item.ratePlanId,
        checkIn,
        checkOut,
      });

    return {
      currency: result.currency,
      snapshot: {
        resourceId: result.resourceId,
        ratePlanId: result.ratePlanId,
        pricingMode: 'CALCULATED',
        suggestedAmountMinor:
          result.totalAmountMinor,
        agreedAmountMinor:
          result.totalAmountMinor,
        adjustmentAmountMinor: 0,
        overrideReason: null,
        nights: result.nights,
        breakdown: result.breakdown,
      },
    };
  }

  private date(
    value: Date,
  ): string {
    return value
      .toISOString()
      .slice(0, 10);
  }
}