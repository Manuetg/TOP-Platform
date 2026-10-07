import { BookingStatus } from './domain/booking-status.enum';

export interface BlockingBooking {
  resourceId: string;
  checkInDate: Date;
  checkOutDate: Date;
}

export const BOOKING_AVAILABILITY_LOOKUP = Symbol('BOOKING_AVAILABILITY_LOOKUP');
export const BOOKING_TIMELINE_REPOSITORY = Symbol('BOOKING_TIMELINE_REPOSITORY');
export { BookingTimelineEventType } from './domain/booking-timeline-event';
export { appendBookingTimelineEvent, type BookingFinanceTimelineInput } from './infrastructure/prisma-booking-finance-timeline.writer';
export { readFinanceServiceEvidence, readFinanceServiceEvidenceBatch, listFinanceServiceEvidence, type FinanceBookingServiceEvidence } from './infrastructure/prisma-finance-service-evidence.reader';
export type { BookingTimelineRepository, BookingTimelineEvent, BookingTimelineCursor, BookingTimelineDetails } from './domain/booking-timeline-event';

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

export interface ReservationsProjectionInput {
  businessId: string;
  from: string;
  to: string;
  timeZone: string;
}

export interface ReservationsProjectionRow {
  status: BookingStatus;
  count: number;
}

export const RESERVATIONS_PROJECTION_READER = Symbol(
  'RESERVATIONS_PROJECTION_READER',
);

export interface ReservationsProjectionReader {
  read(input: ReservationsProjectionInput): Promise<ReservationsProjectionRow[]>;
}

export { BOOKING_REPOSITORY, type BookingRepository, type BookingData } from './domain/booking.repository';
export { BookingStatus };
export { Booking } from './domain/booking.entity';
export { requireBookingUuid, assertBookingCapacity } from './application/booking.validation';
export { assertDateRange, bookingContactId, bookingCount, bookingDate, bookingNotes, bookingResourceIds } from './application/booking.validation';
export { BookingBase } from './application/booking.base';
export type { CreateBookingInput } from './application/create-booking.use-case';
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

export { BOOKING_SEARCH_READER, type BookingSearchReader, type BookingSearchMatch } from './application/booking-search.reader';
