export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export type AvailabilityReason =
  | 'RESOURCE_OUT_OF_SERVICE'
  | 'RESOURCE_ARCHIVED'
  | 'BOOKING_CONFLICT'
  | 'BLOCK_CONFLICT';

export interface AvailabilityResult {
  resourceId: string;
  from: string;
  to: string;
  status: AvailabilityStatus;
  reasons: AvailabilityReason[];
}
