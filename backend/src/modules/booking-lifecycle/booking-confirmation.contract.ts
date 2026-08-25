export const BOOKING_CONFIRMATION_TRANSACTION = Symbol(
  'BOOKING_CONFIRMATION_TRANSACTION',
);

export interface BookingConfirmationSnapshotData {
  currency: string;
  totalAmountMinor: number;
  items: unknown[];
}

export type BookingConfirmationTransactionResult =
  | 'CONFIRMED'
  | 'NOT_FOUND'
  | 'NOT_PENDING';

export interface BookingConfirmationTransactionInput {
  businessId: string;
  bookingId: string;
  prepare: () => Promise<BookingConfirmationSnapshotData>;
}

export interface BookingConfirmationTransaction {
  confirm(
    input: BookingConfirmationTransactionInput,
  ): Promise<BookingConfirmationTransactionResult>;
}