import { Booking } from '../../booking/domain/booking.entity';
import { BookingStatus } from '../../booking/domain/booking-status.enum';
import {
  PaymentMethod,
  PaymentStatus,
  type PaymentRepository,
  type PublicPayment,
} from '../domain/payment';
import {
  ListPaymentsUseCase,
  PaymentHistoryInputError,
  PaymentHistoryNotFoundError,
} from './list-payments.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const paymentId = '33333333-3333-4333-8333-333333333333';

const payment = (overrides: Partial<PublicPayment> = {}): PublicPayment => ({
  id: paymentId,
  bookingId,
  amountMinor: 250000,
  currency: 'PYG',
  method: PaymentMethod.BANK_TRANSFER,
  reference: 'TRX-123',
  note: null,
  paidAt: new Date('2026-09-09T18:00:00.000Z'),
  createdAt: new Date('2026-09-09T18:01:00.000Z'),
  recordedByUserId: '44444444-4444-4444-8444-444444444444',
  status: PaymentStatus.RECORDED,
  ...overrides,
});

describe('ListPaymentsUseCase', () => {
  const findBooking = jest.fn();
  const listByBooking = jest.fn<
    ReturnType<PaymentRepository['listByBooking']>,
    Parameters<PaymentRepository['listByBooking']>
  >();
  const subject = new ListPaymentsUseCase(
    { register: jest.fn(), listByBooking },
    { findByIdAndBusinessId: findBooking } as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findBooking.mockResolvedValue(Booking.create({
      id: bookingId,
      businessId,
      status: BookingStatus.DRAFT,
      contactId: null,
      resourceIds: [],
      checkInDate: null,
      checkOutDate: null,
      adults: null,
      children: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    listByBooking.mockResolvedValue([]);
  });

  it.each([undefined, '1', '50'])('uses limit + 1 for limit %p', async (limit) => {
    await subject.execute({ businessId, bookingId, limit });
    expect(listByBooking).toHaveBeenCalledWith({
      businessId,
      bookingId,
      before: null,
      limit: limit === undefined ? 51 : Number(limit) + 1,
    });
  });

  it.each(['0', '51', '1.5', 'text', '', null])('rejects invalid limit %p', async (limit) => {
    await expect(subject.execute({ businessId, bookingId, limit })).rejects.toBeInstanceOf(PaymentHistoryInputError);
    expect(listByBooking).not.toHaveBeenCalled();
  });

  it('returns an empty final page', async () => {
    await expect(subject.execute({ businessId, bookingId })).resolves.toEqual({
      items: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
  });

  it('returns one requested page and encodes the last returned item', async () => {
    const first = payment();
    const extra = payment({ id: '55555555-5555-4555-8555-555555555555' });
    listByBooking.mockResolvedValue([first, extra]);
    const page = await subject.execute({ businessId, bookingId, limit: '1' });
    expect(page.items).toEqual([first]);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(JSON.parse(Buffer.from(page.pageInfo.nextCursor ?? '', 'base64url').toString('utf8'))).toEqual({
      paidAt: first.paidAt.toISOString(),
      createdAt: first.createdAt.toISOString(),
      id: first.id,
    });
  });

  it('decodes a valid cursor while preserving tenant and Booking scope', async () => {
    const value = payment();
    const cursor = Buffer.from(JSON.stringify({
      paidAt: value.paidAt.toISOString(),
      createdAt: value.createdAt.toISOString(),
      id: value.id,
    })).toString('base64url');
    await subject.execute({ businessId, bookingId, cursor });
    expect(listByBooking).toHaveBeenCalledWith({
      businessId,
      bookingId,
      before: { paidAt: value.paidAt, createdAt: value.createdAt, id: value.id },
      limit: 51,
    });
  });

  it.each([
    'invalid',
    Buffer.from('{invalid').toString('base64url'),
    Buffer.from(JSON.stringify({ paidAt: 'invalid', createdAt: '2026-09-09T18:01:00.000Z', id: paymentId })).toString('base64url'),
    Buffer.from(JSON.stringify({ paidAt: '2026-09-09T18:00:00.000Z', createdAt: 'invalid', id: paymentId })).toString('base64url'),
    Buffer.from(JSON.stringify({ paidAt: '2026-09-09T18:00:00.000Z', createdAt: '2026-09-09T18:01:00.000Z', id: 'invalid' })).toString('base64url'),
    Buffer.from(JSON.stringify({ paidAt: '2026-09-09T18:00:00.000Z', createdAt: '2026-09-09T18:01:00.000Z', id: paymentId, businessId })).toString('base64url'),
  ])('rejects malformed cursor %p', async (cursor) => {
    await expect(subject.execute({ businessId, bookingId, cursor })).rejects.toBeInstanceOf(PaymentHistoryInputError);
    expect(listByBooking).not.toHaveBeenCalled();
  });

  it('hides a missing or cross-tenant Booking before reading Payments', async () => {
    findBooking.mockResolvedValue(null);
    await expect(subject.execute({ businessId, bookingId })).rejects.toBeInstanceOf(PaymentHistoryNotFoundError);
    expect(listByBooking).not.toHaveBeenCalled();
  });

  it.each(['invalid', null])('rejects invalid Booking identifiers %p', async (value) => {
    await expect(subject.execute({ businessId, bookingId: value })).rejects.toBeInstanceOf(PaymentHistoryInputError);
    expect(findBooking).not.toHaveBeenCalled();
  });
});
