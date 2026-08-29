import { BusinessStatus } from '../../business/business.contract';
import { ResourceStatus } from '../../resource/resource.contract';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import { BookingNotDraftError, BookingNotFoundError, BookingResourceUnavailableError, InvalidBookingInputError } from './booking.errors';
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
    expect(create).toHaveBeenCalledWith({ businessId, actorUserId: null, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null });
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
  it.each([
    [{ contactId: null }, { contactId: null }],
    [{ checkInDate: null }, { checkInDate: null }],
    [{ checkOutDate: null }, { checkOutDate: null }],
    [{ adults: 0 }, { adults: 0 }],
    [{ children: 3 }, { children: 3 }],
    [{ notes: ' Nueva nota ' }, { notes: 'Nueva nota' }],
    [{ resourceIds: [] }, { resourceIds: [] }],
  ])('updates only the supplied draft field and preserves distinctive values', async (patch, expected) => {
    const current = booking({ contactId: '44444444-4444-4444-8444-444444444444', resourceIds: [resourceId], checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-03'), adults: 4, children: 2, notes: 'Anterior' });
    findBooking.mockResolvedValueOnce(current); update.mockImplementationOnce((value: Booking) => Promise.resolve(value));
    const result = await updateUseCase.execute({ businessId, bookingId, ...patch });
    expect(result.id).toBe(bookingId); expect(result.businessId).toBe(businessId); expect(result.status).toBe(BookingStatus.DRAFT); expect(result.createdAt).toEqual(current.createdAt);
    expect(result).toMatchObject(expected); expect(update).toHaveBeenCalledWith(expect.objectContaining(expected), Object.prototype.hasOwnProperty.call(patch, 'resourceIds'));
  });
  it('preserves all fields and avoids dependent lookups when patch fields are omitted', async () => {
    const current = booking({ contactId: '44444444-4444-4444-8444-444444444444', resourceIds: [resourceId], checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-03'), adults: 4, children: 2, notes: 'Anterior' }); findBooking.mockResolvedValueOnce(current); update.mockImplementationOnce((value: Booking) => Promise.resolve(value));
    await updateUseCase.execute({ businessId, bookingId, notes: undefined });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ contactId: current.contactId, resourceIds: current.resourceIds, checkInDate: current.checkInDate, checkOutDate: current.checkOutDate, adults: current.adults, children: current.children, notes: current.notes }), false);
    expect(findContact).not.toHaveBeenCalled(); expect(findResource).not.toHaveBeenCalled();
  });
  it('separately validates get and list identifiers, exact delegation and repository errors', async () => {
    await expect(getUseCase.execute('bad', bookingId)).rejects.toBeInstanceOf(InvalidBookingInputError); await expect(getUseCase.execute(businessId, 'bad')).rejects.toBeInstanceOf(InvalidBookingInputError);
    const expected = booking(); findBooking.mockResolvedValueOnce(expected); await expect(getUseCase.execute(businessId, bookingId)).resolves.toBe(expected); expect(findBooking).toHaveBeenCalledWith(bookingId, businessId);
    const error = new Error('repository'); findBooking.mockRejectedValueOnce(error); await expect(getUseCase.execute(businessId, bookingId)).rejects.toBe(error);
    list.mockResolvedValueOnce([expected]); await expect(listUseCase.execute(businessId, {})).resolves.toEqual([expected]); expect(list).toHaveBeenLastCalledWith(businessId, { status: null, contactId: null, resourceId: null });
    list.mockRejectedValueOnce(error); await expect(listUseCase.execute(businessId, { status: BookingStatus.DRAFT, contactId: '44444444-4444-4444-8444-444444444444', resourceId })).rejects.toBe(error);
  });
  it('validates present resource replacements, permits active and out-of-service resources, and rejects archived ones', async () => {
    const current = booking();
    for (const status of [ResourceStatus.ACTIVE, ResourceStatus.OUT_OF_SERVICE]) {
      findBooking.mockResolvedValueOnce(current); findResource.mockResolvedValueOnce({ status }); update.mockImplementationOnce((value: Booking) => Promise.resolve(value));
      await expect(updateUseCase.execute({ businessId, bookingId, resourceIds: [resourceId] })).resolves.toMatchObject({ resourceIds: [resourceId] });
      expect(findResource).toHaveBeenLastCalledWith(resourceId, businessId); expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ resourceIds: [resourceId] }), true);
    }
    findBooking.mockResolvedValueOnce(current); findResource.mockResolvedValueOnce({ status: ResourceStatus.ARCHIVED });
    await expect(updateUseCase.execute({ businessId, bookingId, resourceIds: [resourceId] })).rejects.toBeInstanceOf(BookingResourceUnavailableError); expect(update).toHaveBeenCalledTimes(2);
  });
  it('reports a missing booking for GET and PATCH without persisting', async () => {
    findBooking.mockResolvedValueOnce(null); await expect(getUseCase.execute(businessId, bookingId)).rejects.toBeInstanceOf(BookingNotFoundError); expect(findBooking).toHaveBeenLastCalledWith(bookingId, businessId);
    findBooking.mockResolvedValueOnce(null); await expect(updateUseCase.execute({ businessId, bookingId, notes: 'Nueva' })).rejects.toBeInstanceOf(BookingNotFoundError); expect(update).not.toHaveBeenCalled();
  });
  it('passes present contact and resource list filters exactly to the repository', async () => {
    const contactId = '44444444-4444-4444-8444-444444444444'; list.mockResolvedValueOnce([]); await listUseCase.execute(businessId, { contactId }); expect(list).toHaveBeenLastCalledWith(businessId, { status: null, contactId, resourceId: null }); list.mockResolvedValueOnce([]); await listUseCase.execute(businessId, { resourceId }); expect(list).toHaveBeenLastCalledWith(businessId, { status: null, contactId: null, resourceId });
  });
});
