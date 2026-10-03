import { readCurrentPricingBatch, type CurrentPricing } from '../../pricing/pricing.contract';
import { PrismaBookingFinancialSummaryReader } from './prisma-booking-financial-summary.reader';

jest.mock('../../pricing/pricing.contract', () => ({
  ...jest.requireActual<typeof import('../../pricing/pricing.contract')>('../../pricing/pricing.contract'),
  readCurrentPricingBatch: jest.fn(),
}));

const price = (bookingId: string, totalAmountMinor = 100, overrides: Partial<CurrentPricing> = {}): CurrentPricing => ({
  id: 'snapshot-' + bookingId, originalSnapshotId: 'snapshot-' + bookingId, pricingRevisionId: null, revisionNumber: 0,
  businessId: 'tenant', bookingId, currency: 'PYG', totalAmountMinor, items: [], createdAt: new Date(), ...overrides,
});

describe('PrismaBookingFinancialSummaryReader', () => {
  const findMany = jest.fn();
  const groupBy = jest.fn();
  const currentPrices = jest.mocked(readCurrentPricingBatch);
  const transaction = { booking: { findMany }, payment: { groupBy } };
  const prisma = { $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
  const reader = new PrismaBookingFinancialSummaryReader(prisma as never);
  beforeEach(() => {
    jest.clearAllMocks();
    currentPrices.mockResolvedValue(new Map());
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
  });

  it('reads current prices, states and payments in fixed tenant-scoped batches with RepeatableRead', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a', 1000000)], ['zero', price('zero', 0)]]));
    findMany.mockResolvedValue([{ id: 'a', status: 'CONFIRMED' }]);
    groupBy.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 1n } }]);
    const result = await reader.read('tenant', ['a', 'zero', 'legacy']);
    expect([...result.entries()]).toEqual([
      ['a', { totalAmountMinor: 1000000, paidAmountMinor: 1, outstandingAmountMinor: 999999, creditAmountMinor: 0, currency: 'PYG', bookingStatus: 'CONFIRMED' }],
      ['zero', { totalAmountMinor: 0, paidAmountMinor: 0, outstandingAmountMinor: 0, creditAmountMinor: 0, currency: 'PYG' }],
      ['legacy', { totalAmountMinor: null, paidAmountMinor: 0, outstandingAmountMinor: 0, creditAmountMinor: 0, currency: null }],
    ]);
    expect(currentPrices).toHaveBeenCalledTimes(1);
    expect(currentPrices).toHaveBeenCalledWith(transaction, 'tenant', ['a', 'zero', 'legacy']);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ where: { businessId: 'tenant', id: { in: ['a', 'zero', 'legacy'] } }, select: { id: true, status: true } });
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({ by: ['bookingId', 'currency'], where: { businessId: 'tenant', bookingId: { in: ['a', 'zero', 'legacy'] }, status: 'RECORDED' }, _sum: { amountMinor: true } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  });

  it('publishes excess as credit after a revision without reducing effective recorded payments', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a', 80, { id: 'revision-1', pricingRevisionId: 'revision-1', revisionNumber: 1 })]]));
    groupBy.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 100n } }]);
    await expect(reader.read('tenant', ['a'])).resolves.toEqual(new Map([['a', { totalAmountMinor: 80, paidAmountMinor: 100, outstandingAmountMinor: 0, creditAmountMinor: 20, currency: 'PYG' }]]));
  });

  it('does not read the database for an empty authorized list', async () => {
    await expect(reader.read('tenant', [])).resolves.toEqual(new Map());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects imprecise payment sums instead of rounding BigInt', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a')]]));
    groupBy.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n } }]);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
  });

  it.each([
    [{ bookingId: 'a', currency: 'USD', _sum: { amountMinor: 1n } }],
    [{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: -1n } }],
    [{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 1n } }, { bookingId: 'a', currency: 'USD', _sum: { amountMinor: 1n } }],
  ])('rejects financial corruption without publishing a fabricated balance, case %#', async (...groups) => {
    currentPrices.mockResolvedValue(new Map([['a', price('a')]]));
    groupBy.mockResolvedValue(groups);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow(/BOOKING_FINANCIAL_/);
  });

  it('rejects money detached from agreed pricing', async () => {
    groupBy.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 1n } }]);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow('BOOKING_FINANCIAL_SNAPSHOT_INVARIANT');
  });
});
