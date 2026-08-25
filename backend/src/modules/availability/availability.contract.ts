import type { AvailabilityReason } from './application/availability.types';

export interface OverbookingValidationInput {
  businessId: string;
  resourceIds: string[];
  checkInDate: string;
  checkOutDate: string;
}

export interface OverbookingConflict {
  resourceId: string;
  reasons: AvailabilityReason[];
}

export interface OverbookingValidationResult {
  valid: boolean;
  conflicts: OverbookingConflict[];
}

export interface AvailabilityOverbookingValidator {
  validate(input: OverbookingValidationInput): Promise<OverbookingValidationResult>;
}

export const AVAILABILITY_OVERBOOKING_VALIDATOR = Symbol(
  'AVAILABILITY_OVERBOOKING_VALIDATOR',
);
