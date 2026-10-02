export enum BookingTimelineEventType {
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_SUBMITTED = 'BOOKING_SUBMITTED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_CHECKED_IN = 'BOOKING_CHECKED_IN',
  BOOKING_CHECKED_OUT = 'BOOKING_CHECKED_OUT',
  BOOKING_MARKED_NO_SHOW = 'BOOKING_MARKED_NO_SHOW',
}

export interface BookingTimelineDetails {
  reason?: string;
  paymentId?: string;
  source?: 'MANUAL' | 'FREE_CONFIRM';
  operation?: 'CHECK_IN' | 'CHECK_OUT' | 'NO_SHOW' | 'CONFIRM_WITHOUT_PAYMENT';
  beforeStatus?: string;
  afterStatus?: string;
  beforeUpdatedAt?: string;
  afterUpdatedAt?: string;
}

export interface BookingTimelineEvent {
  id: string;
  businessId: string;
  bookingId: string;
  type: BookingTimelineEventType;
  occurredAt: Date;
  actorUserId: string | null;
  details: BookingTimelineDetails;
}

export interface BookingTimelineCursor {
  occurredAt: Date;
  id: string;
}

export interface BookingTimelineRepository {
  list(input: {
    businessId: string;
    bookingId: string;
    before: BookingTimelineCursor | null;
    limit: number;
  }): Promise<BookingTimelineEvent[]>;
}
