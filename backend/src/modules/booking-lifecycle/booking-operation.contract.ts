import { BookingStatus, BookingTimelineEventType, type Booking } from '../booking/booking.contract';

export enum BookingOperation {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  NO_SHOW = 'NO_SHOW',
  CONFIRM_WITHOUT_PAYMENT = 'CONFIRM_WITHOUT_PAYMENT',
}

export const BOOKING_OPERATION_TRANSITIONS = {
  [BookingOperation.CHECK_IN]: { from: BookingStatus.CONFIRMED, to: BookingStatus.IN_PROGRESS, event: BookingTimelineEventType.BOOKING_CHECKED_IN },
  [BookingOperation.CHECK_OUT]: { from: BookingStatus.IN_PROGRESS, to: BookingStatus.COMPLETED, event: BookingTimelineEventType.BOOKING_CHECKED_OUT },
  [BookingOperation.NO_SHOW]: { from: BookingStatus.CONFIRMED, to: BookingStatus.NO_SHOW, event: BookingTimelineEventType.BOOKING_MARKED_NO_SHOW },
  [BookingOperation.CONFIRM_WITHOUT_PAYMENT]: { from: BookingStatus.PENDING, to: BookingStatus.CONFIRMED, event: BookingTimelineEventType.BOOKING_CONFIRMED },
} as const;

export interface BookingOperationData {
  businessId: string;
  bookingId: string;
  actorUserId: string;
  operation: BookingOperation;
  expectedUpdatedAt: Date;
  reason: string | undefined;
}

export const BOOKING_OPERATION_TRANSACTION = Symbol('BOOKING_OPERATION_TRANSACTION');

export interface BookingOperationTransaction {
  execute(data: BookingOperationData): Promise<Booking>;
}
