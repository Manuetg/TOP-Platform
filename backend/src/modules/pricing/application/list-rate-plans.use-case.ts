import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { RATE_PLAN_REPOSITORY, type RatePlanRepository } from '../domain/rate-plan.repository';
import { RatePlan, type RatePlanResource } from '../domain/rate-plan.entity';
import { RatePlanStatus } from '../domain/rate-plan-status.enum';
import { PRICING_RESOURCE_LOOKUP, type PricingResourceLookup } from '../domain/resource.lookup';
import { validatePricingContext, type PricingContextInput, type PricingSelection } from './validate-pricing-context';

export {
  InvalidListRatePlansInputError,
  ListRatePlansBusinessNotFoundError,
  ListRatePlansBusinessArchivedError,
  ListRatePlansResourceNotFoundError,
  ListRatePlansResourceUnavailableError,
} from './validate-pricing-context';

export type ListRatePlansInput = PricingContextInput;

@Injectable()
export class ListRatePlansUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    @Inject(PRICING_RESOURCE_LOOKUP) private readonly resources: PricingResourceLookup,
    @Inject(RATE_PLAN_REPOSITORY) private readonly ratePlans: RatePlanRepository,
  ) {}

  async execute(input: ListRatePlansInput): Promise<RatePlan[]> {
    const { businessId, selection } = await validatePricingContext(input, this.businesses, this.resources);
    const plans = await this.ratePlans.listByBusinessId(businessId);
    return selection ? plans.filter((plan) => this.isSelectable(plan, selection)) : plans;
  }

  private isSelectable(plan: RatePlan, selection: PricingSelection): boolean {
    return plan.status === RatePlanStatus.ACTIVE &&
      this.isAssigned(plan.resources, selection.resourceId) &&
      (plan.validFrom === null || selection.checkIn >= plan.validFrom) &&
      (plan.validTo === null || selection.checkOut <= plan.validTo);
  }

  private isAssigned(resources: RatePlanResource[], resourceId: string): boolean {
    return resources.some((resource) => resource.id === resourceId);
  }
}
