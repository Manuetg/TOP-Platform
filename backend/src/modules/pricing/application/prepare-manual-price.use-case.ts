import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { pricingDateDaysBetween } from '../domain/pricing-date';
import type { ManualPricingSnapshotItem } from '../domain/pricing-snapshot.repository';
import { ListRatePlansBusinessArchivedError, ListRatePlansBusinessNotFoundError, ListRatePlansUseCase } from './list-rate-plans.use-case';
import { manualAgreedAmount, manualPriceReason } from './manual-price-input';

export class ManualPriceRatePlanAvailableError extends Error {}

export interface PrepareManualPriceInput {
  businessId: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
  agreedAmountMinor?: unknown;
  overrideReason?: unknown;
}

@Injectable()
export class PrepareManualPriceUseCase {
  constructor(
    private readonly listRatePlans: ListRatePlansUseCase,
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
  ) {}

  async execute(input: PrepareManualPriceInput): Promise<{ currency: string; snapshot: ManualPricingSnapshotItem }> {
    const agreedAmountMinor = manualAgreedAmount(input.agreedAmountMinor);
    const overrideReason = manualPriceReason(input.overrideReason);
    // Reutiliza la selección contextual: tenant, estado, fechas, asignación y vigencia.
    const plans = await this.listRatePlans.execute(input);
    if (plans.length > 0) {
      throw new ManualPriceRatePlanAvailableError('Hay un tarifario disponible para esta estadía. Volvé a consultar y seleccioná un plan de referencia.');
    }
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ListRatePlansBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new ListRatePlansBusinessArchivedError('El negocio está archivado.');
    return {
      currency: business.currency,
      snapshot: {
        resourceId: input.resourceId,
        ratePlanId: null,
        pricingMode: 'MANUAL_NO_RATE_PLAN',
        suggestedAmountMinor: null,
        adjustmentAmountMinor: null,
        agreedAmountMinor,
        overrideReason,
        nights: pricingDateDaysBetween(input.checkIn, input.checkOut),
        breakdown: [],
      },
    };
  }
}
