import { PrismaBookingFinancialSummaryReader } from './prisma-booking-financial-summary.reader';

describe('PrismaBookingFinancialSummaryReader', () => {
  const findMany = jest.fn();
  const groupBy = jest.fn();
  const transaction = { pricingSnapshot: { findMany }, payment: { groupBy } };
  const prisma = { $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
  const reader = new PrismaBookingFinancialSummaryReader(prisma as never);
  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    groupBy.mockResolvedValue([]);
  });

  it('reads all booking finances with two tenant-scoped queries instead of one query per booking', async () => {
    findMany.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', totalAmountMinor: 1000000n }, { bookingId: 'zero', currency: 'PYG', totalAmountMinor: 0n }]);
    groupBy.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 1n } }]);
    const result = await reader.read('tenant', ['a', 'zero', 'legacy']);
    expect([...result.entries()]).toEqual([
      ['a', { totalAmountMinor: 1000000, paidAmountMinor: 1, currency: 'PYG' }],
      ['zero', { totalAmountMinor: 0, paidAmountMinor: 0, currency: 'PYG' }],
      ['legacy', { totalAmountMinor: null, paidAmountMinor: 0, currency: null }],
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({ by: ['bookingId', 'currency'], where: { businessId: 'tenant', bookingId: { in: ['a', 'zero', 'legacy'] }, status: 'RECORDED' }, _sum: { amountMinor: true } });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  });
  it('does not read the database for an empty authorized list', async () => {
    await expect(reader.read('tenant', [])).resolves.toEqual(new Map());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects imprecise money instead of rounding a BigInt snapshot', async () => {
    findMany.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', totalAmountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n }]);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
  });
  it.each([
    [{ bookingId: 'a', currency: 'USD', _sum: { amountMinor: 1n } }],
    [{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 101n } }],
    [{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: -1n } }],
    [{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 1n } }, { bookingId: 'a', currency: 'USD', _sum: { amountMinor: 1n } }],
  ])('rejects financial corruption without publishing a fabricated balance, case %#', async (...groups) => {
    findMany.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', totalAmountMinor: 100n }]);
    groupBy.mockResolvedValue(groups);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow(/BOOKING_FINANCIAL_/);
  });
  it('rejects money detached from an agreed pricing snapshot', async () => {
    groupBy.mockResolvedValue([{ bookingId: 'a', currency: 'PYG', _sum: { amountMinor: 1n } }]);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow('BOOKING_FINANCIAL_SNAPSHOT_INVARIANT');
  });
});
