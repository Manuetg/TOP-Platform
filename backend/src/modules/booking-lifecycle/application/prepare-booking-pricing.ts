import { CalculatePriceUseCase } from '../../pricing/application/calculate-price.use-case';
import { ApplyManualPriceOverrideUseCase } from '../../pricing/application/apply-manual-price-override.use-case';
import { PrepareManualPriceUseCase } from '../../pricing/application/prepare-manual-price.use-case';
import type { PricingSnapshotItem } from '../../pricing/pricing.contract';
import { requireBookingUuid } from '../../booking/booking.contract';
import type { BookingConfirmationSnapshotData } from '../booking-confirmation.contract';
import { BookingPricingRequiredError, InvalidBookingPricingInputError } from './confirm-booking.errors';

interface ConfirmBookingPricingInput {
  resourceId: string;
  ratePlanId: string | null;
  agreedAmountMinor?: unknown;
  overrideReason?: unknown;
}

export class PrepareBookingPricing {
  constructor(
    private readonly calculatePrice: CalculatePriceUseCase,
    private readonly applyManualPriceOverride: ApplyManualPriceOverrideUseCase,
    private readonly prepareManualPrice: PrepareManualPriceUseCase,
  ) {}

  async execute(businessId: string, range: { checkInDate: Date; checkOutDate: Date }, resourceIds: string[], pricing: unknown): Promise<BookingConfirmationSnapshotData> {
    return this.prepareSnapshot(businessId, range, this.validate(pricing, resourceIds));
  }

  validate(
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

    const ratePlanId = this.ratePlanReference(item);

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

  private ratePlanReference(item: Record<string, unknown>): string | null {
    const manualWithoutPlan = item.pricingMode === 'MANUAL_NO_RATE_PLAN';
    if (item.pricingMode !== undefined && !manualWithoutPlan) {
      throw new InvalidBookingPricingInputError('El origen del precio no es válido.');
    }
    if (manualWithoutPlan && item.ratePlanId !== undefined) {
      throw new InvalidBookingPricingInputError('El precio manual sin tarifario no admite un plan de referencia.');
    }
    return manualWithoutPlan ? null : requireBookingUuid(
      item.ratePlanId,
      'El identificador de la tarifa no es válido.',
    );
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

    if (item.ratePlanId === null) {
      return this.prepareManualPrice.execute({
        businessId, resourceId: item.resourceId, checkIn, checkOut,
        agreedAmountMinor: item.agreedAmountMinor, overrideReason: item.overrideReason,
      });
    }

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
