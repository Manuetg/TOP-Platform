import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { PRICING_RESOURCE_LOOKUP, type PricingResourceLookup } from '../domain/resource.lookup';
import { PricingCalculator, type PricingCalculation } from '../domain/pricing-calculator';
import { isValidPricingDate, pricingDateDaysBetween } from '../domain/pricing-date';
import { RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP, type RatePlanResourceAssignmentLookup } from '../domain/rate-plan-resource-assignment.lookup';
import { RATE_PLAN_REPOSITORY, type RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { SEASONAL_RATE_REPOSITORY, type SeasonalRateRepository } from '../domain/seasonal-rate.repository';
import {
  CalculatePriceBusinessArchivedError,
  CalculatePriceBusinessNotFoundError,
  CalculatePriceOutsideValidityError,
  CalculatePriceRatePlanArchivedError,
  CalculatePriceRatePlanNotAssignedError,
  CalculatePriceRatePlanNotFoundError,
  CalculatePriceResourceNotFoundError,
  CalculatePriceResourceUnavailableError,
  InvalidCalculatePriceInputError,
} from './calculate-price.errors';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumNights = 365;

export interface CalculatePriceInput {
  businessId: string;
  ratePlanId: string;
  resourceId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
}

export interface CalculatedPrice extends PricingCalculation {
  businessId: string;
  resourceId: string;
  ratePlanId: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  baseNightlyAmountMinor: number;
}

@Injectable()
export class CalculatePriceUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(PRICING_RESOURCE_LOOKUP) private readonly resources: PricingResourceLookup,
    @Inject(RATE_PLAN_REPOSITORY) private readonly ratePlans: RatePlanRepository,
    @Inject(RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP)
    private readonly assignments: RatePlanResourceAssignmentLookup,
    @Inject(SEASONAL_RATE_REPOSITORY) private readonly seasonalRates: SeasonalRateRepository,
    private readonly calculator: PricingCalculator,
  ) {}

  async execute(input: CalculatePriceInput): Promise<CalculatedPrice> {
    this.validateIds(input);
    const { resourceId, checkIn, checkOut, nights } = this.validateStay(input);

    const business = await this.loadBusiness(input.businessId);
    await this.loadResource(resourceId, input.businessId);
    const ratePlan = await this.loadRatePlan(input.ratePlanId, input.businessId);
    if (!(await this.assignments.isAssigned(ratePlan.id, resourceId))) {
      throw new CalculatePriceRatePlanNotAssignedError('La tarifa no está asignada al recurso.');
    }
    if (
      (ratePlan.validFrom !== null && checkIn < ratePlan.validFrom) ||
      (ratePlan.validTo !== null && checkOut > ratePlan.validTo)
    ) {
      throw new CalculatePriceOutsideValidityError('La estadía está fuera de la vigencia de la tarifa.');
    }

    const seasons = await this.seasonalRates.listIntersectingRange(ratePlan.id, checkIn, checkOut);
    const calculation = this.calculator.calculate(
      ratePlan.baseNightlyAmountMinor,
      checkIn,
      checkOut,
      seasons,
    );

    return {
      businessId: input.businessId,
      resourceId,
      ratePlanId: ratePlan.id,
      currency: business.currency,
      checkIn,
      checkOut,
      baseNightlyAmountMinor: ratePlan.baseNightlyAmountMinor,
      nights,
      breakdown: calculation.breakdown,
      totalAmountMinor: calculation.totalAmountMinor,
    };
  }

  private async loadBusiness(businessId: string) {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new CalculatePriceBusinessNotFoundError('El negocio no existe.');
    if (business.status === BusinessStatus.ARCHIVED) throw new CalculatePriceBusinessArchivedError('El negocio está archivado.');
    return business;
  }

  private async loadResource(resourceId: string, businessId: string): Promise<void> {
    const resource = await this.resources.findByIdAndBusinessId(resourceId, businessId);
    if (!resource) throw new CalculatePriceResourceNotFoundError('El recurso no existe.');
    if (resource.status !== 'ACTIVE') throw new CalculatePriceResourceUnavailableError('El recurso no está disponible para cotización.');
  }

  private async loadRatePlan(ratePlanId: string, businessId: string) {
    const ratePlan = await this.ratePlans.findByIdAndBusinessId(ratePlanId, businessId);
    if (!ratePlan) throw new CalculatePriceRatePlanNotFoundError('La tarifa no existe.');
    if (ratePlan.status === RatePlanStatus.ARCHIVED) throw new CalculatePriceRatePlanArchivedError('La tarifa está archivada.');
    return ratePlan;
  }

  private validateIds(input: CalculatePriceInput): void {
    if (!uuid.test(input.businessId)) {
      throw new InvalidCalculatePriceInputError('El identificador del negocio no es válido.');
    }
    if (!uuid.test(input.ratePlanId)) {
      throw new InvalidCalculatePriceInputError('El identificador de la tarifa no es válido.');
    }
  }

  private validateStay(input: CalculatePriceInput): {
    resourceId: string;
    checkIn: string;
    checkOut: string;
    nights: number;
  } {
    if (typeof input.resourceId !== 'string' || !uuid.test(input.resourceId)) {
      throw new InvalidCalculatePriceInputError('El identificador del recurso no es válido.');
    }
    if (!isValidPricingDate(input.checkIn)) {
      throw new InvalidCalculatePriceInputError('La fecha de entrada es inválida.');
    }
    if (!isValidPricingDate(input.checkOut)) {
      throw new InvalidCalculatePriceInputError('La fecha de salida es inválida.');
    }
    const nights = pricingDateDaysBetween(input.checkIn, input.checkOut);
    if (nights <= 0) {
      throw new InvalidCalculatePriceInputError('La fecha de entrada debe ser anterior a la fecha de salida.');
    }
    if (nights > maximumNights) {
      throw new InvalidCalculatePriceInputError('La estadía no puede superar 365 noches.');
    }
    return { resourceId: input.resourceId, checkIn: input.checkIn, checkOut: input.checkOut, nights };
  }
}
