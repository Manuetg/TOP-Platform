import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { isValidPricingDate, pricingDateDaysBetween } from '../domain/pricing-date';
import { RATE_PLAN_REPOSITORY, type RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlan, type RatePlanResource } from '../domain/rate-plan.entity';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { PRICING_RESOURCE_LOOKUP, type PricingResourceLookup } from '../domain/resource.lookup';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumNights = 365;

export class InvalidListRatePlansInputError extends Error {}
export class ListRatePlansBusinessNotFoundError extends Error {}
export class ListRatePlansBusinessArchivedError extends Error {}
export class ListRatePlansResourceNotFoundError extends Error {}
export class ListRatePlansResourceUnavailableError extends Error {}

export interface ListRatePlansInput {
  businessId: unknown;
  resourceId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
}

interface Selection {
  resourceId: string;
  checkIn: string;
  checkOut: string;
}

@Injectable()
export class ListRatePlansUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(PRICING_RESOURCE_LOOKUP) private readonly resources: PricingResourceLookup,
    @Inject(RATE_PLAN_REPOSITORY) private readonly ratePlans: RatePlanRepository,
  ) {}

  async execute(input: ListRatePlansInput): Promise<RatePlan[]> {
    const businessId = this.businessId(input.businessId);
    const selection = this.selection(input);
    const business = await this.businesses.findById(businessId);
    if (!business) throw new ListRatePlansBusinessNotFoundError('El negocio no existe.');

    if (selection) {
      if (business.status !== BusinessStatus.ACTIVE) {
        throw new ListRatePlansBusinessArchivedError('El negocio está archivado.');
      }
      await this.activeResource(selection.resourceId, businessId);
    }

    const plans = await this.ratePlans.listByBusinessId(businessId);
    return selection ? plans.filter((plan) => this.isSelectable(plan, selection)) : plans;
  }

  private businessId(value: unknown): string {
    if (typeof value !== 'string' || !uuid.test(value)) {
      throw new InvalidListRatePlansInputError('El identificador del negocio no es válido.');
    }
    return value;
  }

  private selection(input: ListRatePlansInput): Selection | null {
    const values = [input.resourceId, input.checkIn, input.checkOut];
    const present = values.filter((value) => value !== undefined).length;
    if (present === 0) return null;
    if (present !== values.length) {
      throw new InvalidListRatePlansInputError('resourceId, checkIn y checkOut deben enviarse juntos.');
    }
    if (typeof input.resourceId !== 'string' || !uuid.test(input.resourceId)) {
      throw new InvalidListRatePlansInputError('El identificador del recurso no es válido.');
    }
    if (!isValidPricingDate(input.checkIn)) {
      throw new InvalidListRatePlansInputError('La fecha de entrada es inválida.');
    }
    if (!isValidPricingDate(input.checkOut)) {
      throw new InvalidListRatePlansInputError('La fecha de salida es inválida.');
    }
    const nights = pricingDateDaysBetween(input.checkIn, input.checkOut);
    if (nights <= 0) {
      throw new InvalidListRatePlansInputError('La fecha de entrada debe ser anterior a la fecha de salida.');
    }
    if (nights > maximumNights) {
      throw new InvalidListRatePlansInputError('La estadía no puede superar 365 noches.');
    }
    return { resourceId: input.resourceId, checkIn: input.checkIn, checkOut: input.checkOut };
  }

  private async activeResource(resourceId: string, businessId: string): Promise<void> {
    const resource = await this.resources.findByIdAndBusinessId(resourceId, businessId);
    if (!resource) throw new ListRatePlansResourceNotFoundError('El recurso no existe.');
    if (resource.status !== 'ACTIVE') {
      throw new ListRatePlansResourceUnavailableError('El recurso no está disponible para cotización.');
    }
  }

  private isSelectable(plan: RatePlan, selection: Selection): boolean {
    return plan.status === RatePlanStatus.ACTIVE &&
      this.isAssigned(plan.resources, selection.resourceId) &&
      (plan.validFrom === null || selection.checkIn >= plan.validFrom) &&
      (plan.validTo === null || selection.checkOut <= plan.validTo);
  }

  private isAssigned(resources: RatePlanResource[], resourceId: string): boolean {
    return resources.some((resource) => resource.id === resourceId);
  }
}
