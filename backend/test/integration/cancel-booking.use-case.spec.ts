import { PrismaClient } from '@prisma/client';
import { CancelBookingUseCase } from '../../src/modules/booking-lifecycle/application/cancel-booking.use-case';
import { BookingCancellationNotAllowedError, BookingStatus } from '../../src/modules/booking/booking.contract';
import { PrismaBookingRepository } from '../../src/modules/booking/infrastructure/prisma-booking.repository';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('CancelBookingUseCase', () => {
  const prisma = new PrismaClient(); const businesses = new PrismaBusinessRepository(prisma); const bookings = new PrismaBookingRepository(prisma); const useCase = new CancelBookingUseCase(businesses, bookings);
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  async function booking(status: BookingStatus = BookingStatus.DRAFT) { const business = await prisma.business.create({ data: { name: `Business ${crypto.randomUUID()}` } }); const created = await bookings.create({ businessId: business.id, contactId: null, resourceIds: [], checkInDate: null, checkOutDate: null, adults: null, children: null, notes: null }); if (status !== BookingStatus.DRAFT) await prisma.booking.update({ where: { id: created.id }, data: { status } }); return { business, booking: created }; }
  it.each([BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED])('cancels %s and preserves its snapshot history', async (status) => { const value = await booking(status); if (status === BookingStatus.CONFIRMED) await prisma.pricingSnapshot.create({ data: { businessId: value.business.id, bookingId: value.booking.id, currency: 'PYG', totalAmountMinor: 1, items: [] } }); await expect(useCase.execute({ businessId: value.business.id, bookingId: value.booking.id })).resolves.toMatchObject({ status: BookingStatus.CANCELLED }); await expect(prisma.pricingSnapshot.count({ where: { bookingId: value.booking.id } })).resolves.toBe(status === BookingStatus.CONFIRMED ? 1 : 0); });
  it('is idempotent for an already cancelled booking', async () => { const value = await booking(BookingStatus.CANCELLED); await expect(useCase.execute({ businessId: value.business.id, bookingId: value.booking.id })).resolves.toMatchObject({ status: BookingStatus.CANCELLED }); });
  it.each([BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.NO_SHOW])('rejects %s without changing status', async (status) => { const value = await booking(status); await expect(useCase.execute({ businessId: value.business.id, bookingId: value.booking.id })).rejects.toBeInstanceOf(BookingCancellationNotAllowedError); await expect(prisma.booking.findUnique({ where: { id: value.booking.id } })).resolves.toMatchObject({ status }); });
  it('hides bookings from another tenant', async () => { const owner = await booking(); const other = await booking(); await expect(useCase.execute({ businessId: other.business.id, bookingId: owner.booking.id })).rejects.toThrow('reserva no existe'); });
});
