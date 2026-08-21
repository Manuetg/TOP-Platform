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
  ): Promise<boolean>;
  listBlockingBookings(
    businessId: string,
    from: Date,
    to: Date,
  ): Promise<BlockingBooking[]>;
}
