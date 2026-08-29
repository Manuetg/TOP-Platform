export interface BlockingBooking {
  resourceId: string;
  checkInDate: Date;
  checkOutDate: Date;
}

export const BOOKING_AVAILABILITY_LOOKUP = Symbol('BOOKING_AVAILABILITY_LOOKUP');
export const BOOKING_TIMELINE_REPOSITORY = Symbol('BOOKING_TIMELINE_REPOSITORY');
export { BookingTimelineEventType } from './domain/booking-timeline-event';
export type { BookingTimelineRepository, BookingTimelineEvent, BookingTimelineCursor } from './domain/booking-timeline-event';

export interface BookingAvailabilityLookup {
  hasBlockingBooking(
    businessId: string,
    resourceId: string,
    from: Date,
    to: Date,
    pendingBlocksAvailability?: boolean,
    excludeBookingId?: string,
  ): Promise<boolean>;

  listBlockingBookings(
    businessId: string,
    from: Date,
    to: Date,
    pendingBlocksAvailability?: boolean,
  ): Promise<BlockingBooking[]>;
}

export { BOOKING_REPOSITORY, type BookingRepository } from './domain/booking.repository';
export { BookingStatus } from './domain/booking-status.enum';
export type { Booking } from './domain/booking.entity';
export { requireBookingUuid } from './application/booking.validation';
export {
  BookingAvailabilityConflictError,
  BookingCancellationNotAllowedError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingContactRequiredError,
  BookingDatesRequiredError,
  BookingNotDraftError,
  BookingNotFoundError,
  BookingResourceNotFoundError,
  BookingResourceUnavailableError,
  BookingResourcesRequiredError,
  InvalidBookingInputError,
} from './application/booking.errors';
