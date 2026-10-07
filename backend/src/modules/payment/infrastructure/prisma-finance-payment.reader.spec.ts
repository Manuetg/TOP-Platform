import { readRecordedPaymentsForFinance } from './prisma-finance-payment.reader';

describe('Payment financial public reader', () => {
  it('returns safe public registered facts without idempotency metadata or application joins', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'payment', bookingId: 'booking', amountMinor: 450000n, currency: 'PYG', paidAt: new Date('2026-10-01T00:00:00Z'), reference: null }]);
    const queryRaw = jest.fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>().mockResolvedValue([{ paymentId: 'payment', paymentVersion: 1n, invalidMonetaryData: false }]);
    const result = await readRecordedPaymentsForFinance({ payment: { findMany }, $queryRaw: queryRaw } as never, 'tenant');
    expect(findMany).toHaveBeenCalledWith({ where: { businessId: 'tenant', status: 'RECORDED' }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], take: 5001, select: { id: true, bookingId: true, amountMinor: true, currency: true, paidAt: true, reference: true } });
    expect(result).toEqual([{ id: 'payment', bookingId: 'booking', amountMinor: 450000, currency: 'PYG', paidAt: '2026-10-01T00:00:00.000Z', reference: null, paymentVersion: 1 }]);
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(['tenant', ['payment']]);
  });

  it('rejects overflow instead of silently rounding a persisted amount', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'payment', amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n }]);
    const queryRaw = jest.fn().mockResolvedValue([{ paymentId: 'payment', paymentVersion: 1n, invalidMonetaryData: false }]);
    await expect(readRecordedPaymentsForFinance({ payment: { findMany }, $queryRaw: queryRaw } as never, 'tenant')).rejects.toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
  });

  it('returns an empty source without inferring accounts from payment method', async () => {
    await expect(readRecordedPaymentsForFinance({ payment: { findMany: jest.fn().mockResolvedValue([]) }, $queryRaw: jest.fn().mockResolvedValue([]) } as never, 'tenant')).resolves.toEqual([]);
  });
});
