import { BusinessStatus } from '../../business/business.contract';
import { ResourceStatus } from '../../resource/resource.contract';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import { BookingNotDraftError, BookingResourceUnavailableError, InvalidBookingInputError } from './booking.errors';
import { CreateBookingUseCase } from './create-booking.use-case';
import { GetBookingUseCase } from './get-booking.use-case';
import { ListBookingsUseCase } from './list-bookings.use-case';
import { UpdateBookingUseCase } from './update-booking.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const booking = (values: Partial<Parameters<typeof Booking.create>[0]> = {}): Booking => Booking.create({ id: bookingId, businessId, status: BookingStatus.DRAFT, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...values });

describe('Booking use cases', () => {
  const findBusiness = jest.fn(); const findContact = jest.fn(); const findResource = jest.fn(); const create = jest.fn(); const findBooking = jest.fn(); const list = jest.fn(); const update = jest.fn();
  const businesses = { findById: findBusiness } as never; const contacts = { findByIdAndBusinessId: findContact } as never; const resources = { findByIdAndBusinessId: findResource } as never; const bookings = { create, findByIdAndBusinessId: findBooking, listByBusinessId: list, update } as never;
  const createUseCase = new CreateBookingUseCase(businesses, contacts, resources, bookings); const getUseCase = new GetBookingUseCase(bookings); const listUseCase = new ListBookingsUseCase(bookings); const updateUseCase = new UpdateBookingUseCase(businesses, contacts, resources, bookings);
  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE }); findContact.mockResolvedValue({}); findResource.mockResolvedValue({ status: ResourceStatus.ACTIVE }); });
  it('creates an empty draft and normalizes optional values', async () => {
    create.mockResolvedValueOnce(booking());
    await expect(createUseCase.execute({ businessId })).resolves.toEqual(booking());
    expect(create).toHaveBeenCalledWith({ businessId, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null });
  });
  it('validates strict dates and dependencies before creation', async () => {
    await expect(createUseCase.execute({ businessId, checkInDate: '2026-02-30' })).rejects.toBeInstanceOf(InvalidBookingInputError);
    await expect(createUseCase.execute({ businessId, checkInDate: '2026-04-02', checkOutDate: '2026-04-02' })).rejects.toBeInstanceOf(InvalidBookingInputError);
    findResource.mockResolvedValueOnce({ status: ResourceStatus.ARCHIVED });
    await expect(createUseCase.execute({ businessId, resourceIds: [resourceId] })).rejects.toBeInstanceOf(BookingResourceUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });
  it('gets and lists only scoped public booking aggregates', async () => {
    findBooking.mockResolvedValueOnce(booking({ resourceIds: [resourceId] })); list.mockResolvedValueOnce([booking()]);
    await expect(getUseCase.execute(businessId, bookingId)).resolves.toEqual(booking({ resourceIds: [resourceId] }));
    await expect(listUseCase.execute(businessId, { status: BookingStatus.DRAFT, resourceId })).resolves.toEqual([booking()]);
    expect(list).toHaveBeenCalledWith(businessId, { status: BookingStatus.DRAFT, contactId: null, resourceId });
  });
  it('updates a draft with final-state validation and atomically replaces resources', async () => {
    findBooking.mockResolvedValueOnce(booking({ checkInDate: new Date('2026-04-01'), resourceIds: [resourceId] })); update.mockImplementationOnce((value: Booking) => Promise.resolve(value));
    await expect(updateUseCase.execute({ businessId, bookingId, checkOutDate: '2026-04-04', resourceIds: [] })).resolves.toMatchObject({ resourceIds: [], checkOutDate: new Date('2026-04-04') });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ resourceIds: [] }), true);
  });
  it('does not modify non drafts or accept an empty update body', async () => {
    await expect(updateUseCase.execute({ businessId, bookingId })).rejects.toBeInstanceOf(InvalidBookingInputError);
    findBooking.mockResolvedValueOnce(booking({ status: BookingStatus.CONFIRMED }));
    await expect(updateUseCase.execute({ businessId, bookingId, notes: 'nota' })).rejects.toBeInstanceOf(BookingNotDraftError);
    expect(update).not.toHaveBeenCalled();
  });
});
