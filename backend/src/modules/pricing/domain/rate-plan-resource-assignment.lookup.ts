export const RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP = Symbol('RATE_PLAN_RESOURCE_ASSIGNMENT_LOOKUP');

export interface RatePlanResourceAssignmentLookup {
  isAssigned(ratePlanId: string, resourceId: string): Promise<boolean>;
}
