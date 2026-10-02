import { Inject, Injectable } from '@nestjs/common';
import { requireBookingUuid, type Booking } from '../../booking/booking.contract';
import type { PricingSnapshotItem } from '../../pricing/pricing.contract';
import { CalculatePriceUseCase } from '../../pricing/application/calculate-price.use-case';
import { ApplyManualPriceOverrideUseCase } from '../../pricing/application/apply-manual-price-override.use-case';
import { PrepareManualPriceUseCase } from '../../pricing/application/prepare-manual-price.use-case';
import { BOOKING_AMENDMENT_TRANSACTION, type BookingAmendmentPreview, type BookingAmendmentTransaction, type BookingAmendmentTransactionInput } from '../booking-amendment.contract';
import { PrepareBookingPricing } from './prepare-booking-pricing';
import { amendmentChanges, amendmentExpectation, type BookingAmendmentInput } from './booking-amendment.validation';

@Injectable()
export class BookingAmendmentUseCase {
  constructor(
    @Inject(BOOKING_AMENDMENT_TRANSACTION) private readonly transaction: BookingAmendmentTransaction,
    private readonly calculatePrice: CalculatePriceUseCase,
    private readonly applyManualPriceOverride: ApplyManualPriceOverrideUseCase,
    private readonly prepareManualPrice: PrepareManualPriceUseCase,
  ) {}

  preview(input: BookingAmendmentInput): Promise<BookingAmendmentPreview> { return this.transaction.preview(this.prepare(input)); }
  save(input: BookingAmendmentInput): Promise<Booking> { return this.transaction.save(this.prepare(input), amendmentExpectation(input)); }

  private prepare(input: BookingAmendmentInput): BookingAmendmentTransactionInput {
    const pricing = new PrepareBookingPricing(this.calculatePrice, this.applyManualPriceOverride, this.prepareManualPrice);
    return {
      businessId: requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.'),
      bookingId: requireBookingUuid(input.bookingId, 'El identificador de la reserva no es válido.'),
      actorUserId: requireBookingUuid(input.actorUserId, 'El identificador del actor no es válido.'),
      changes: amendmentChanges(input),
      preparePricing: async (range, resourceIds) => {
        const quote = await pricing.execute(input.businessId, range, resourceIds, input.pricing);
        return { ...quote, items: quote.items as PricingSnapshotItem[] };
      },
    };
  }
}
