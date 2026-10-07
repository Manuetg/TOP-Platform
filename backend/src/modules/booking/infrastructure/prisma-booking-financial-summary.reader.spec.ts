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

interface EffectiveStateFixture {
  paymentId: string; businessId: string; bookingId: string; currency: string;
  grossRecordedAmountMinor: bigint; voidedAmountMinor: bigint; refundedAmountMinor: bigint; netRetainedAmountMinor: bigint;
  paymentVersion: bigint; invalidMonetaryData: boolean; applicationInvalid: boolean;
}
const paymentState = (bookingId: string, amountMinor: bigint, overrides: Partial<EffectiveStateFixture> = {}): EffectiveStateFixture => ({
  paymentId: 'payment-' + bookingId, businessId: 'tenant', bookingId, currency: 'PYG',
  grossRecordedAmountMinor: amountMinor, voidedAmountMinor: 0n, refundedAmountMinor: 0n, netRetainedAmountMinor: amountMinor,
  paymentVersion: 1n, invalidMonetaryData: false, applicationInvalid: false, ...overrides,
});

describe('PrismaBookingFinancialSummaryReader', () => {
  const findMany = jest.fn();
  const queryRaw = jest.fn<Promise<EffectiveStateFixture[]>, [TemplateStringsArray, ...unknown[]]>();
  const currentPrices = jest.mocked(readCurrentPricingBatch);
  const transaction = { booking: { findMany }, $queryRaw: queryRaw };
  const prisma = { $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)) };
  const reader = new PrismaBookingFinancialSummaryReader(prisma as never);
  beforeEach(() => {
    jest.clearAllMocks();
    currentPrices.mockResolvedValue(new Map());
    findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
  });

  it('reads current prices, states and payments in fixed tenant-scoped batches with RepeatableRead', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a', 1000000)], ['zero', price('zero', 0)]]));
    findMany.mockResolvedValue([{ id: 'a', status: 'CONFIRMED' }]);
    queryRaw.mockResolvedValue([paymentState('a', 1n)]);
    const result = await reader.read('tenant', ['a', 'zero', 'legacy']);
    expect([...result.entries()]).toEqual([
      ['a', { totalAmountMinor: 1000000, paidAmountMinor: 1, netRetainedAmountMinor: 1, grossRecordedAmountMinor: 1, voidedAmountMinor: 0, refundedAmountMinor: 0, financialVersion: 1, outstandingAmountMinor: 999999, creditAmountMinor: 0, currency: 'PYG', bookingStatus: 'CONFIRMED' }],
      ['zero', { totalAmountMinor: 0, paidAmountMinor: 0, netRetainedAmountMinor: 0, grossRecordedAmountMinor: 0, voidedAmountMinor: 0, refundedAmountMinor: 0, financialVersion: 0, outstandingAmountMinor: 0, creditAmountMinor: 0, currency: 'PYG' }],
      ['legacy', { totalAmountMinor: null, paidAmountMinor: 0, netRetainedAmountMinor: 0, grossRecordedAmountMinor: 0, voidedAmountMinor: 0, refundedAmountMinor: 0, financialVersion: 0, outstandingAmountMinor: 0, creditAmountMinor: 0, currency: null }],
    ]);
    expect(currentPrices).toHaveBeenCalledTimes(1);
    expect(currentPrices).toHaveBeenCalledWith(transaction, 'tenant', ['a', 'zero', 'legacy']);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({ where: { businessId: 'tenant', id: { in: ['a', 'zero', 'legacy'] } }, select: { id: true, status: true } });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [query, ...values] = queryRaw.mock.calls[0];
    expect(query.join('?')).toContain('FROM "PaymentEffectiveState" state');
    expect(query.join('?')).toContain('FROM "PaymentApplicationEffective" application');
    expect(query.join('?')).toContain('WHERE state."businessId" = ? AND state."bookingId" = ANY(?::text[])');
    expect(values).toEqual(['tenant', ['a', 'zero', 'legacy']]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
  });

  it('publishes excess as credit after a revision without reducing effective recorded payments', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a', 80, { id: 'revision-1', pricingRevisionId: 'revision-1', revisionNumber: 1 })]]));
    queryRaw.mockResolvedValue([paymentState('a', 100n)]);
    await expect(reader.read('tenant', ['a'])).resolves.toEqual(new Map([['a', { totalAmountMinor: 80, paidAmountMinor: 100, netRetainedAmountMinor: 100, grossRecordedAmountMinor: 100, voidedAmountMinor: 0, refundedAmountMinor: 0, financialVersion: 1, outstandingAmountMinor: 0, creditAmountMinor: 20, currency: 'PYG' }]]));
  });

  it('changes credit into debt after an own refund while preserving original gross and advancing the financial version', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a', 80)]]));
    queryRaw.mockResolvedValueOnce([paymentState('a', 100n)]);
    expect((await reader.read('tenant', ['a'])).get('a')).toEqual({ totalAmountMinor: 80, paidAmountMinor: 100, netRetainedAmountMinor: 100, grossRecordedAmountMinor: 100, voidedAmountMinor: 0, refundedAmountMinor: 0, financialVersion: 1, outstandingAmountMinor: 0, creditAmountMinor: 20, currency: 'PYG' });
    queryRaw.mockResolvedValueOnce([paymentState('a', 100n, { refundedAmountMinor: 40n, netRetainedAmountMinor: 60n, paymentVersion: 2n })]);
    expect((await reader.read('tenant', ['a'])).get('a')).toEqual({ totalAmountMinor: 80, paidAmountMinor: 60, netRetainedAmountMinor: 60, grossRecordedAmountMinor: 100, voidedAmountMinor: 0, refundedAmountMinor: 40, financialVersion: 2, outstandingAmountMinor: 20, creditAmountMinor: 0, currency: 'PYG' });
  });

  it('does not read the database for an empty authorized list', async () => {
    await expect(reader.read('tenant', [])).resolves.toEqual(new Map());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects imprecise payment sums instead of rounding BigInt', async () => {
    currentPrices.mockResolvedValue(new Map([['a', price('a')]]));
    queryRaw.mockResolvedValue([paymentState('a', BigInt(Number.MAX_SAFE_INTEGER) + 1n)]);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
  });

  it.each([
    [paymentState('a', 1n, { currency: 'USD' })],
    [paymentState('a', -1n)],
    [paymentState('a', 1n), paymentState('a', 1n, { paymentId: 'second-payment', currency: 'USD' })],
  ])('rejects financial corruption without publishing a fabricated balance, case %#', async (...states) => {
    currentPrices.mockResolvedValue(new Map([['a', price('a')]]));
    queryRaw.mockResolvedValue(states);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow(/BOOKING_FINANCIAL_/);
  });

  it('rejects money detached from agreed pricing', async () => {
    queryRaw.mockResolvedValue([paymentState('a', 1n)]);
    await expect(reader.read('tenant', ['a'])).rejects.toThrow('BOOKING_FINANCIAL_SNAPSHOT_INVARIANT');
  });
});
