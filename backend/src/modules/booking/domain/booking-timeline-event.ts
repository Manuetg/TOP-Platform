export enum BookingTimelineEventType {
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_SUBMITTED = 'BOOKING_SUBMITTED',
  BOOKING_CONFIRMED = 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
}

export interface BookingTimelineEvent {
  id: string;
  businessId: string;
  bookingId: string;
  type: BookingTimelineEventType;
  occurredAt: Date;
  actorUserId: string | null;
  details: { reason?: string };
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
