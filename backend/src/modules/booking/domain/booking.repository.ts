import { Booking } from './booking.entity';
import { BookingStatus } from './booking-status.enum';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');
export interface BookingData { businessId: string; contactId: string | null; resourceIds: string[]; checkInDate: Date | null; checkOutDate: Date | null; adults: number | null; children: number | null; notes: string | null; }
export interface BookingListFilters { status: BookingStatus | null; contactId: string | null; resourceId: string | null; }
export interface BookingRepository {
  create(data: BookingData): Promise<Booking>;
  findByIdAndBusinessId(id: string, businessId: string): Promise<Booking | null>;
  listByBusinessId(businessId: string, filters: BookingListFilters): Promise<Booking[]>;
  update(booking: Booking, replaceResources: boolean): Promise<Booking>;
}
