import { Booking } from './booking.entity';
import { BookingStatus } from './booking-status.enum';
import type { BlockingBooking } from '../booking.contract';
import type { BookingTimelineEventType } from './booking-timeline-event';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');
export interface BookingData { businessId: string; contactId: string | null; resourceIds: string[]; checkInDate: Date | null; checkOutDate: Date | null; adults: number | null; children: number | null; notes: string | null; actorUserId?: string | null; }
export interface BookingListFilters { status: BookingStatus | null; contactId: string | null; resourceId: string | null; }
export interface BookingRepository {
  create(data: BookingData): Promise<Booking>;
  findByIdAndBusinessId(id: string, businessId: string): Promise<Booking | null>;
  listByBusinessId(businessId: string, filters: BookingListFilters): Promise<Booking[]>;
  update(booking: Booking, replaceResources: boolean): Promise<Booking>;
  markPending(id: string, businessId?: string, actorUserId?: string | null): Promise<Booking>;
  markCancelled(id: string, businessId?: string, actorUserId?: string | null, reason?: string): Promise<Booking>;
  appendTimelineEvent(input: { businessId: string; bookingId: string; type: BookingTimelineEventType; actorUserId: string | null; reason?: string }): Promise<void>;
  hasBlockingBooking(businessId:string, resourceId:string, from:Date, to:Date, pendingBlocksAvailability?: boolean):Promise<boolean>;
  listBlockingBookings(
    businessId: string,
    from: Date,
    to: Date,
    pendingBlocksAvailability?: boolean,
  ): Promise<BlockingBooking[]>;
}
