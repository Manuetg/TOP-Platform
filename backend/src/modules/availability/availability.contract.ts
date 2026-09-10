import type { AvailabilityReason } from './application/availability.types';

export interface OverbookingValidationInput {
  businessId: string;
  resourceIds: string[];
  checkInDate: string;
  checkOutDate: string;
  excludeBookingId?: string;
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

export interface OccupancyProjectionInput {
  businessId: string;
  from: string;
  to: string;
  timeZone: string;
}

export interface OccupancyProjection {
  occupiedResourceNights: number;
  sellableResourceNights: number;
}

export const OCCUPANCY_PROJECTION_READER = Symbol('OCCUPANCY_PROJECTION_READER');

export interface OccupancyProjectionReader {
  read(input: OccupancyProjectionInput): Promise<OccupancyProjection>;
}

export const AVAILABILITY_OVERBOOKING_VALIDATOR = Symbol(
  'AVAILABILITY_OVERBOOKING_VALIDATOR',
);
