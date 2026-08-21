import { Injectable } from '@nestjs/common';
import type { NightlyPriceBreakdown } from '../domain/pricing-calculator';
import { CalculatePriceUseCase } from './calculate-price.use-case';
import { InvalidManualPriceOverrideInputError } from './manual-price-override.errors';

export interface ApplyManualPriceOverrideInput {
  businessId: string;
  ratePlanId: string;
  resourceId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  agreedAmountMinor?: unknown;
  overrideReason?: unknown;
}

export interface ManualPriceOverride {
  businessId: string;
  resourceId: string;
  ratePlanId: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricingMode: 'MANUAL_OVERRIDE';
  suggestedAmountMinor: number;
  agreedAmountMinor: number;
  adjustmentAmountMinor: number;
  overrideReason: string;
  suggestedBreakdown: NightlyPriceBreakdown[];
}

@Injectable()
export class ApplyManualPriceOverrideUseCase {
  constructor(private readonly calculatePrice: CalculatePriceUseCase) {}

  async execute(input: ApplyManualPriceOverrideInput): Promise<ManualPriceOverride> {
    const agreedAmountMinor = this.agreedAmount(input.agreedAmountMinor);
    const overrideReason = this.reason(input.overrideReason);
    const suggested = await this.calculatePrice.execute({
      businessId: input.businessId,
      ratePlanId: input.ratePlanId,
      resourceId: input.resourceId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    });

    return {
      businessId: suggested.businessId,
      resourceId: suggested.resourceId,
      ratePlanId: suggested.ratePlanId,
      currency: suggested.currency,
      checkIn: suggested.checkIn,
      checkOut: suggested.checkOut,
      nights: suggested.nights,
      pricingMode: 'MANUAL_OVERRIDE',
      suggestedAmountMinor: suggested.totalAmountMinor,
      agreedAmountMinor,
      adjustmentAmountMinor: agreedAmountMinor - suggested.totalAmountMinor,
      overrideReason,
      suggestedBreakdown: suggested.breakdown,
    };
  }

  private agreedAmount(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new InvalidManualPriceOverrideInputError('El importe acordado debe ser un entero seguro no negativo.');
    }
    return value;
  }

  private reason(value: unknown): string {
    if (typeof value !== 'string') {
      throw new InvalidManualPriceOverrideInputError('El motivo del precio personalizado es obligatorio.');
    }
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 500) {
      throw new InvalidManualPriceOverrideInputError('El motivo del precio personalizado debe tener entre 2 y 500 caracteres.');
    }
    return trimmed;
  }
}
