import type { BookingData } from '../booking/booking.contract';
import type { BookingConfirmationSnapshotData } from './booking-confirmation.contract';

export const PENDING_BOOKING_TRANSACTION = Symbol('PENDING_BOOKING_TRANSACTION');
export interface PendingBookingTransactionInput {
  data: BookingData;
  preparePricing: () => Promise<BookingConfirmationSnapshotData>;
}
export interface PendingBookingTransaction {
  create(input: PendingBookingTransactionInput): Promise<string>;
}
