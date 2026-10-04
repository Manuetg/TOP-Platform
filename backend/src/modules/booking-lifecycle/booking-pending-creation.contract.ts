import type { Booking } from '../booking/domain/booking.entity';

export const BOOKING_PENDING_CREATION = Symbol('BOOKING_PENDING_CREATION');

export interface BookingPendingCreationInput {
  businessId: string;
  contactId: string;
  resourceId: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  actorUserId: string | null;
  transaction: unknown;
}

export interface BookingPendingCreation {
  createPendingInTransaction(input: BookingPendingCreationInput): Promise<Booking>;
}
