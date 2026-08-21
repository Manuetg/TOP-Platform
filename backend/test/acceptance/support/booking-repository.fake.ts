import { Booking } from '../../../src/modules/booking/domain/booking.entity';
import { BookingStatus } from '../../../src/modules/booking/domain/booking-status.enum';
import type { BookingData, BookingListFilters, BookingRepository } from '../../../src/modules/booking/domain/booking.repository';
const bookings = new Map<string, Booking>();
const isBlocking = (booking: Booking, businessId: string, from: Date, to: Date) =>
  booking.businessId === businessId &&
  [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS].includes(booking.status) &&
  booking.checkInDate !== null &&
  booking.checkOutDate !== null &&
  booking.checkInDate < to &&
  booking.checkOutDate > from;
export const bookingRepositoryFake: BookingRepository = { create: (data: BookingData) => { const now = new Date(); const booking = Booking.create({ id: `b0000000-0000-4000-8000-${String(bookings.size + 1).padStart(12, '0')}`, ...data, status: BookingStatus.DRAFT, createdAt: now, updatedAt: now }); bookings.set(booking.id, booking); return Promise.resolve(booking); }, findByIdAndBusinessId: (id, businessId) => Promise.resolve(bookings.get(id)?.businessId === businessId ? bookings.get(id) ?? null : null), listByBusinessId: (businessId, filters: BookingListFilters) => Promise.resolve([...bookings.values()].filter((booking) => booking.businessId === businessId && (filters.status === null || booking.status === filters.status) && (filters.contactId === null || booking.contactId === filters.contactId) && (filters.resourceId === null || booking.resourceIds.includes(filters.resourceId))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id))), update: (booking) => { bookings.set(booking.id, booking); return Promise.resolve(booking); }, hasBlockingBooking: (businessId, resourceId, from, to) => Promise.resolve([...bookings.values()].some((booking) => isBlocking(booking, businessId, from, to) && booking.resourceIds.includes(resourceId))), listBlockingBookings: (businessId, from, to) => Promise.resolve([...bookings.values()].filter((booking) => isBlocking(booking, businessId, from, to)).flatMap((booking) => booking.resourceIds.map((resourceId) => ({ resourceId, checkInDate: booking.checkInDate!, checkOutDate: booking.checkOutDate! })))) };
export function addBookingFake(booking: Booking): void { bookings.set(booking.id, booking); }
export function resetBookingRepositoryFake(): void { bookings.clear(); }
