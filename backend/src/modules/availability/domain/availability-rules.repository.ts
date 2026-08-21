export interface AvailabilityRules {
  businessId: string;
  pendingBlocksAvailability: boolean;
  bufferBeforeDays: number;
  bufferAfterDays: number;
}

export const DEFAULT_AVAILABILITY_RULES = {
  pendingBlocksAvailability: true,
  bufferBeforeDays: 0,
  bufferAfterDays: 0,
} as const;

export const AVAILABILITY_RULES_REPOSITORY = Symbol('AVAILABILITY_RULES_REPOSITORY');

export interface AvailabilityRulesRepository {
  findByBusinessId(businessId: string): Promise<AvailabilityRules | null>;
  save(rules: AvailabilityRules): Promise<AvailabilityRules>;
}
