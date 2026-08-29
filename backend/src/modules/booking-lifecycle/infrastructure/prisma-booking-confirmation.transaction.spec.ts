import { PrismaBookingConfirmationTransaction } from './prisma-booking-confirmation.transaction';

const businessId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const firstResourceId = '33333333-3333-4333-8333-333333333333';
const secondResourceId = '44444444-4444-4444-8444-444444444444';

describe('PrismaBookingConfirmationTransaction', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const createSnapshot = jest.fn();
  const createTimelineEvent = jest.fn();
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = {
    booking: { findFirst, updateMany },
    pricingSnapshot: { create: createSnapshot },
    bookingTimelineEvent: { create: createTimelineEvent },
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
  };
  const executeTransaction = jest.fn(
    (callback: (client: typeof transaction) => unknown) => callback(transaction),
  );
  const repository = new PrismaBookingConfirmationTransaction({
    $transaction: executeTransaction,
  } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    executeTransaction.mockImplementation(
      (callback: (client: typeof transaction) => unknown) => callback(transaction),
    );
    queryRaw.mockResolvedValue([]);
    executeRaw.mockResolvedValue(1);
    findFirst.mockResolvedValue({
      id: bookingId,
      status: 'PENDING',
      resources: [
        { resourceId: firstResourceId },
        { resourceId: secondResourceId },
      ],
    });
    updateMany.mockResolvedValue({ count: 1 });
    createSnapshot.mockResolvedValue({ id: 'snapshot-id' });
  });

  const input = () => ({
    businessId,
    bookingId,
    actorUserId: null,
    prepare: jest.fn().mockResolvedValue({
      currency: 'PYG',
      totalAmountMinor: 300000,
      items: [{ resourceId: firstResourceId }],
    }),
  });

  it('locks, snapshots and confirms the pending booking atomically', async () => {
    const confirmation = input();

    await expect(repository.confirm(confirmation)).resolves.toBe('CONFIRMED');

    expect(executeTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5000, timeout: 30000 },
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: bookingId, businessId },
      select: {
        id: true,
        status: true,
        resources: {
          select: { resourceId: true },
          orderBy: { resourceId: 'asc' },
        },
      },
    });
    expect(confirmation.prepare).toHaveBeenCalledTimes(1);
    expect(createSnapshot).toHaveBeenCalledWith({
      data: {
        businessId,
        bookingId,
        currency: 'PYG',
        totalAmountMinor: 300000,
        items: [{ resourceId: firstResourceId }],
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: bookingId, businessId, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });
  });

  it('returns NOT_FOUND without preparing a snapshot when the locked booking is absent', async () => {
    findFirst.mockResolvedValueOnce(null);
    const confirmation = input();

    await expect(repository.confirm(confirmation)).resolves.toBe('NOT_FOUND');

    expect(confirmation.prepare).not.toHaveBeenCalled();
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('returns NOT_PENDING without preparing a snapshot for another lifecycle state', async () => {
    findFirst.mockResolvedValueOnce({
      id: bookingId,
      status: 'DRAFT',
      resources: [],
    });
    const confirmation = input();

    await expect(repository.confirm(confirmation)).resolves.toBe('NOT_PENDING');

    expect(confirmation.prepare).not.toHaveBeenCalled();
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('fails when the pending status changes before the atomic update', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(repository.confirm(input())).rejects.toThrow(
      'La reserva cambió de estado durante la confirmación.',
    );
  });
});
