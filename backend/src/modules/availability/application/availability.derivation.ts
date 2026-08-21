import { ResourceStatus } from '../../resource/resource.contract';
import type { AvailabilityReason, AvailabilityStatus } from './availability.types';

export function deriveAvailability(
  resourceStatus: ResourceStatus,
  hasBookingConflict: boolean,
  hasBlockConflict: boolean,
): { status: AvailabilityStatus; reasons: AvailabilityReason[] } {
  if (resourceStatus === ResourceStatus.OUT_OF_SERVICE) {
    return {
      status: 'UNAVAILABLE',
      reasons: ['RESOURCE_OUT_OF_SERVICE'],
    };
  }

  if (resourceStatus === ResourceStatus.ARCHIVED) {
    return {
      status: 'UNAVAILABLE',
      reasons: ['RESOURCE_ARCHIVED'],
    };
  }

  const reasons: AvailabilityReason[] = [];
  if (hasBookingConflict) {
    reasons.push('BOOKING_CONFLICT');
  }
  if (hasBlockConflict) {
    reasons.push('BLOCK_CONFLICT');
  }

  return {
    status: reasons.length > 0 ? 'UNAVAILABLE' : 'AVAILABLE',
    reasons,
  };
}
