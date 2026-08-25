import { PrismaBookingRepository } from './prisma-booking.repository';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import type { Booking as PrismaBooking, BookingResource } from '@prisma/client';

const businessId = '11111111-1111-4111-8111-111111111111'; const bookingId = '22222222-2222-4222-8222-222222222222'; const resourceId = '33333333-3333-4333-8333-333333333333';
type Row = PrismaBooking & { resources: BookingResource[] };
const row = (values: Partial<Row> = {}): Row => ({ id: bookingId, businessId, status: 'DRAFT', contactId: null, checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), resources: [], ...values });

describe('PrismaBookingRepository', () => {
  const booking = { create: jest.fn<Promise<Row>, [unknown]>(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() }; const bookingResource = { deleteMany: jest.fn(), createMany: jest.fn() }; const transaction = { booking, bookingResource }; const prisma = { $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)), booking, bookingResource };
  const repository = new PrismaBookingRepository(prisma as never);
  beforeEach(() => jest.clearAllMocks());
  it('creates an atomic empty draft and maps nullables', async () => {
    booking.create.mockResolvedValueOnce(row());
    await expect(repository.create({ businessId, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null })).resolves.toMatchObject({ status: BookingStatus.DRAFT, resourceIds: [] });
    const [call] = booking.create.mock.calls; expect(call?.[0]).toMatchObject({ data: { businessId, status: 'DRAFT', resources: { create: [] } } });
  });
  it('creates complete data with all requested resources', async () => {
    booking.create.mockResolvedValueOnce(row({ contactId: '44444444-4444-4444-8444-444444444444', resources: [{ bookingId, resourceId, createdAt: new Date() }, { bookingId, resourceId: '55555555-5555-4555-8555-555555555555', createdAt: new Date() }] }));
    await repository.create({ businessId, contactId: '44444444-4444-4444-8444-444444444444', resourceIds: [resourceId, '55555555-5555-4555-8555-555555555555'], checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-02'), adults: 2, children: 1, notes: 'Nota' });
    const [call] = booking.create.mock.calls; expect(call?.[0]).toMatchObject({ data: { adults: 2, children: 1, notes: 'Nota', resources: { create: [{ resourceId }, { resourceId: '55555555-5555-4555-8555-555555555555' }] } } });
  });
  it('scopes reads and lists using all approved filters and deterministic order', async () => { booking.findFirst.mockResolvedValueOnce(null); booking.findMany.mockResolvedValueOnce([]); await expect(repository.findByIdAndBusinessId(bookingId, businessId)).resolves.toBeNull(); await expect(repository.listByBusinessId(businessId, { status: BookingStatus.DRAFT, contactId: '44444444-4444-4444-8444-444444444444', resourceId })).resolves.toEqual([]); expect(booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: bookingId, businessId } })); expect(booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId, status: BookingStatus.DRAFT, contactId: '44444444-4444-4444-8444-444444444444', resources: { some: { resourceId } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })); });
  it('updates fields and replaces resource relations atomically including empty arrays', async () => { booking.update.mockResolvedValueOnce(row()); bookingResource.deleteMany.mockResolvedValueOnce({ count: 1 }); booking.findUniqueOrThrow.mockResolvedValueOnce(row({ notes: 'Actualizada' })); const aggregate = Booking.create({ id: bookingId, businessId, status: BookingStatus.DRAFT, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: 0, children: 0, notes: 'Actualizada', createdAt: new Date(), updatedAt: new Date() }); await expect(repository.update(aggregate, true)).resolves.toMatchObject({ notes: 'Actualizada' }); expect(bookingResource.deleteMany).toHaveBeenCalledWith({ where: { bookingId } }); expect(bookingResource.createMany).not.toHaveBeenCalled(); });
  it('persists only PENDING status when submitting a booking', async () => { booking.update.mockResolvedValueOnce(row({ status: BookingStatus.PENDING })); await expect(repository.markPending(bookingId)).resolves.toMatchObject({ id: bookingId, status: BookingStatus.PENDING }); expect(booking.update).toHaveBeenCalledWith({ where: { id: bookingId }, data: { status: BookingStatus.PENDING }, include: { resources: { orderBy: { resourceId: 'asc' } } } }); });
  it('maps every row returned by a list with all resource identifiers', async () => { const otherId = '44444444-4444-4444-8444-444444444444'; booking.findMany.mockResolvedValueOnce([row({ resources: [{ bookingId, resourceId, createdAt: new Date() }, { bookingId, resourceId: otherId, createdAt: new Date() }] }), row({ id: otherId, notes: 'Otra', adults: 5 })]); const result = await repository.listByBusinessId(businessId, { status: null, contactId: null, resourceId: null }); expect(result).toHaveLength(2); expect(result[0]).toMatchObject({ id: bookingId, resourceIds: [resourceId, otherId] }); expect(result[1]).toMatchObject({ id: otherId, notes: 'Otra', adults: 5 }); });
  it('updates without replacing resources using exact persisted data and include', async () => { const aggregate = Booking.create({ id: bookingId, businessId, status: BookingStatus.DRAFT, contactId: '44444444-4444-4444-8444-444444444444', resourceIds: [resourceId], checkInDate: new Date('2026-04-01'), checkOutDate: new Date('2026-04-03'), adults: 2, children: 1, notes: 'Nota', createdAt: new Date(), updatedAt: new Date() }); booking.update.mockResolvedValueOnce(row()); booking.findUniqueOrThrow.mockResolvedValueOnce(row({ resources: [{ bookingId, resourceId, createdAt: new Date() }] })); await repository.update(aggregate, false); expect(booking.update).toHaveBeenCalledWith({ where: { id: bookingId }, data: { contactId: aggregate.contactId, checkInDate: aggregate.checkInDate, checkOutDate: aggregate.checkOutDate, adults: aggregate.adults, children: aggregate.children, notes: aggregate.notes } }); expect(bookingResource.deleteMany).not.toHaveBeenCalled(); expect(bookingResource.createMany).not.toHaveBeenCalled(); expect(booking.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: bookingId }, include: { resources: { orderBy: { resourceId: 'asc' } } } }); });
  it('replaces resources with exact junction rows', async () => { const second = '55555555-5555-4555-8555-555555555555'; const aggregate = Booking.create({ id: bookingId, businessId, status: BookingStatus.DRAFT, contactId: null, resourceIds: [resourceId, second], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null, createdAt: new Date(), updatedAt: new Date() }); booking.update.mockResolvedValueOnce(row()); bookingResource.deleteMany.mockResolvedValueOnce({ count: 1 }); bookingResource.createMany.mockResolvedValueOnce({ count: 2 }); booking.findUniqueOrThrow.mockResolvedValueOnce(row({ resources: [{ bookingId, resourceId, createdAt: new Date() }, { bookingId, resourceId: second, createdAt: new Date() }] })); await repository.update(aggregate, true); expect(bookingResource.deleteMany).toHaveBeenCalledWith({ where: { bookingId } }); expect(bookingResource.createMany).toHaveBeenCalledWith({ data: [{ bookingId, resourceId }, { bookingId, resourceId: second }] }); expect(booking.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: bookingId }, include: { resources: { orderBy: { resourceId: 'asc' } } } }); });
  it('finds only blocking bookings in the requested tenant and semi-open range', async () => {
    const from = new Date('2026-04-01'); const to = new Date('2026-04-03');
    booking.findFirst.mockResolvedValueOnce({ id: bookingId }).mockResolvedValueOnce(null);
    await expect(repository.hasBlockingBooking(businessId, resourceId, from, to)).resolves.toBe(true);
    await expect(repository.hasBlockingBooking(businessId, resourceId, from, to)).resolves.toBe(false);
    expect(booking.findFirst).toHaveBeenNthCalledWith(1, { where: { businessId, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] }, resources: { some: { resourceId } }, checkInDate: { lt: to }, checkOutDate: { gt: from } }, select: { id: true } });
  });
  it('excludes the current Booking from blocking availability when requested', async () => {
    const from = new Date('2026-04-01');
    const to = new Date('2026-04-03');
    const excludeBookingId =
      '44444444-4444-4444-8444-444444444444';

    booking.findFirst.mockResolvedValueOnce(null);

    await expect(
      repository.hasBlockingBooking(
        businessId,
        resourceId,
        from,
        to,
        true,
        excludeBookingId,
      ),
    ).resolves.toBe(false);

    expect(booking.findFirst).toHaveBeenCalledWith({
      where: {
        businessId,
        id: {
          not: excludeBookingId,
        },
        status: {
          in: [
            'PENDING',
            'CONFIRMED',
            'IN_PROGRESS',
          ],
        },
        resources: {
          some: {
            resourceId,
          },
        },
        checkInDate: {
          lt: to,
        },
        checkOutDate: {
          gt: from,
        },
      },
      select: {
        id: true,
      },
    });
  });

  it('propagates Prisma failures while looking up blocking bookings', async () => {
    const error = new Error('lookup failed'); booking.findFirst.mockRejectedValueOnce(error);
    await expect(repository.hasBlockingBooking(businessId, resourceId, new Date('2026-04-01'), new Date('2026-04-03'))).rejects.toBe(error);
  });
  it('loads blocking bookings for the complete calendar range and flattens resource assignments', async () => {
    const from = new Date('2026-04-01'); const to = new Date('2026-04-04'); const second = '44444444-4444-4444-8444-444444444444';
    booking.findMany.mockResolvedValueOnce([{ checkInDate: new Date('2026-04-02'), checkOutDate: new Date('2026-04-04'), resources: [{ resourceId }, { resourceId: second }] }]);
    await expect(repository.listBlockingBookings(businessId, from, to)).resolves.toEqual([{ resourceId, checkInDate: new Date('2026-04-02'), checkOutDate: new Date('2026-04-04') }, { resourceId: second, checkInDate: new Date('2026-04-02'), checkOutDate: new Date('2026-04-04') }]);
    expect(booking.findMany).toHaveBeenCalledWith({ where: { businessId, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] }, checkInDate: { lt: to }, checkOutDate: { gt: from } }, select: { checkInDate: true, checkOutDate: true, resources: { select: { resourceId: true } } } });
  });
});
