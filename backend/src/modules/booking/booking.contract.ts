export interface BlockingBooking {
  resourceId: string;
  checkInDate: Date;
  checkOutDate: Date;
}

export const BOOKING_AVAILABILITY_LOOKUP = Symbol('BOOKING_AVAILABILITY_LOOKUP');

export interface BookingAvailabilityLookup {
  hasBlockingBooking(
    businessId: string,
    resourceId: string,
    from: Date,
    to: Date,
    pendingBlocksAvailability?: boolean,
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
