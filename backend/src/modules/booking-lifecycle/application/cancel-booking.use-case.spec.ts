import { BusinessStatus } from '../../business/business.contract';
import { Booking } from '../../booking/domain/booking.entity';
import {
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingCancellationNotAllowedError,
  BookingNotFoundError,
  BookingStatus,
  InvalidBookingInputError,
} from '../../booking/booking.contract';
import { CancelBookingUseCase } from './cancel-booking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const booking = (status: BookingStatus) => Booking.create({ id: bookingId, businessId, status, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() });

describe('CancelBookingUseCase', () => {
  const findBusiness = jest.fn(); const findBooking = jest.fn(); const markCancelled = jest.fn();
  const useCase = new CancelBookingUseCase({ findById: findBusiness, create: jest.fn(), list: jest.fn(), update: jest.fn() }, { create: jest.fn(), findByIdAndBusinessId: findBooking, listByBusinessId: jest.fn(), update: jest.fn(), markPending: jest.fn(), markCancelled, hasBlockingBooking: jest.fn(), listBlockingBookings: jest.fn() });
  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE }); findBooking.mockResolvedValue(booking(BookingStatus.DRAFT)); markCancelled.mockResolvedValue(booking(BookingStatus.CANCELLED)); });
  it.each([BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED])('cancels an allowed %s booking preserving its associations', async (status) => { findBooking.mockResolvedValueOnce(booking(status)); await expect(useCase.execute({ businessId, bookingId })).resolves.toMatchObject({ status: BookingStatus.CANCELLED }); expect(markCancelled).toHaveBeenCalledWith(bookingId, businessId, null, undefined); });
  it('keeps an already cancelled booking idempotently without persistence', async () => { const cancelled = booking(BookingStatus.CANCELLED); findBooking.mockResolvedValueOnce(cancelled); await expect(useCase.execute({ businessId, bookingId, reason:'Cambio de planes' })).resolves.toBe(cancelled); expect(markCancelled).not.toHaveBeenCalled(); });
  it.each([BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.NO_SHOW])('rejects cancellation for %s', async (status) => { findBooking.mockResolvedValueOnce(booking(status)); await expect(useCase.execute({ businessId, bookingId })).rejects.toBeInstanceOf(BookingCancellationNotAllowedError); expect(markCancelled).not.toHaveBeenCalled(); });
  it('hides a missing or cross-tenant booking', async () => { findBooking.mockResolvedValueOnce(null); await expect(useCase.execute({ businessId, bookingId })).rejects.toBeInstanceOf(BookingNotFoundError); expect(findBooking).toHaveBeenCalledWith(bookingId, businessId); expect(markCancelled).not.toHaveBeenCalled(); });
  it('rejects a missing or inactive business before reading the Booking', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(useCase.execute({ businessId, bookingId })).rejects.toBeInstanceOf(BookingBusinessNotFoundError);
    expect(findBooking).not.toHaveBeenCalled();
    findBusiness.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED });
    await expect(useCase.execute({ businessId, bookingId })).rejects.toBeInstanceOf(BookingBusinessUnavailableError);
    expect(findBooking).not.toHaveBeenCalled();
  });
  it('validates identifiers before repositories', async () => { await expect(useCase.execute({ businessId: 'invalid', bookingId })).rejects.toBeInstanceOf(InvalidBookingInputError); expect(findBusiness).not.toHaveBeenCalled(); });
  it.each([undefined,null,''])('accepts an absent cancellation reason',async(reason)=>{await useCase.execute({businessId,bookingId,reason});expect(markCancelled).toHaveBeenCalledWith(bookingId,businessId,null,undefined);});
  it('trims and accepts reason boundaries',async()=>{await useCase.execute({businessId,bookingId,reason:' ok '});expect(markCancelled).toHaveBeenLastCalledWith(bookingId,businessId,null,'ok');await useCase.execute({businessId,bookingId,reason:'x'.repeat(500)});expect(markCancelled).toHaveBeenLastCalledWith(bookingId,businessId,null,'x'.repeat(500));});
  it.each([' ','x','x'.repeat(501),42])('rejects an invalid cancellation reason',async(reason)=>{await expect(useCase.execute({businessId,bookingId,reason})).rejects.toBeInstanceOf(InvalidBookingInputError);expect(markCancelled).not.toHaveBeenCalled();});
  it('returns the concurrent cancellation without a duplicate persistence call',async()=>{const draft=booking(BookingStatus.DRAFT);const cancelled=booking(BookingStatus.CANCELLED);findBooking.mockResolvedValueOnce(draft).mockResolvedValueOnce(cancelled);markCancelled.mockResolvedValueOnce(null);await expect(useCase.execute({businessId,bookingId})).resolves.toBe(cancelled);expect(markCancelled).toHaveBeenCalledTimes(1);});
});
