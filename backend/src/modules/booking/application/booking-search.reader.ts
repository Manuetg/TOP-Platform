import { BookingStatus } from '../domain/booking-status.enum';
export interface BookingSearchMatch { id: string; title: string; subtitle: string | null; status: BookingStatus; }
export const BOOKING_SEARCH_READER = Symbol('BOOKING_SEARCH_READER');
export interface BookingSearchReader { read(businessId: string, query: string): Promise<BookingSearchMatch[]>; }
