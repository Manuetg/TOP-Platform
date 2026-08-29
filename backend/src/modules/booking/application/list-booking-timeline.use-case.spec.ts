import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import { BookingTimelineEventType } from '../domain/booking-timeline-event';
import { BookingNotFoundError, InvalidBookingInputError } from './booking.errors';
import { ListBookingTimelineUseCase } from './list-booking-timeline.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const booking = Booking.create({ id: bookingId, businessId, status: BookingStatus.DRAFT, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });

describe('ListBookingTimelineUseCase', () => {
  const find = jest.fn();
  const list = jest.fn();
  const repository = { create: jest.fn(), findByIdAndBusinessId: find, listByBusinessId: jest.fn(), update: jest.fn(), markPending: jest.fn(), markCancelled: jest.fn(), hasBlockingBooking: jest.fn(), listBlockingBookings: jest.fn() };
  const useCase = new ListBookingTimelineUseCase(repository, { list } as never);
  beforeEach(() => { jest.resetAllMocks(); find.mockResolvedValue(booking); list.mockResolvedValue([]); });
  it('returns a page and opaque cursor', async () => {
    const events = [0, 1].map((offset) => ({ id: `33333333-3333-4333-8333-33333333333${offset}`, businessId, bookingId, type: BookingTimelineEventType.BOOKING_CREATED, occurredAt: new Date(`2026-08-29T18:00:0${1-offset}.000Z`), actorUserId: null, details: {} }));
    list.mockResolvedValueOnce(events);
    const page = await useCase.execute({ businessId, bookingId, limit: '1' });
    expect(page.items).toEqual([events[0]]);
    expect(page.pageInfo).toEqual({ hasNextPage: true, nextCursor: expect.any(String) });
    expect(list).toHaveBeenCalledWith({ businessId, bookingId, before: null, limit: 2 });
  });
  it.each([{ cursor: 'invalid' }, { limit: '0' }, { limit: '51' }, {limit:'1.5'}, {limit:'text'}])('rejects invalid pagination', async (input) => { await expect(useCase.execute({ businessId, bookingId, ...input })).rejects.toBeInstanceOf(InvalidBookingInputError); });
  it.each([
    Buffer.from('{invalid').toString('base64url'),
    Buffer.from(JSON.stringify({occurredAt:'invalid',id:'33333333-3333-4333-8333-333333333333'})).toString('base64url'),
    Buffer.from(JSON.stringify({occurredAt:'2026-08-29T18:00:00.000Z',id:'invalid'})).toString('base64url'),
  ])('rejects malformed opaque cursor data',async(cursor)=>{await expect(useCase.execute({businessId,bookingId,cursor})).rejects.toBeInstanceOf(InvalidBookingInputError);});
  it('keeps tenant and booking scope when consuming a foreign cursor',async()=>{const cursor=Buffer.from(JSON.stringify({occurredAt:'2026-08-29T18:00:00.000Z',id:'33333333-3333-4333-8333-333333333333'})).toString('base64url');await useCase.execute({businessId,bookingId,cursor});expect(list).toHaveBeenCalledWith(expect.objectContaining({businessId,bookingId}));});
  it('hides missing or cross-tenant bookings', async () => { find.mockResolvedValueOnce(null); await expect(useCase.execute({ businessId, bookingId })).rejects.toBeInstanceOf(BookingNotFoundError); expect(list).not.toHaveBeenCalled(); });
});
