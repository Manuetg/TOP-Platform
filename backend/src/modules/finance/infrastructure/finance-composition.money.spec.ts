import type { Prisma } from '@prisma/client';
import { readRecordedPaymentsForFinance, readPaymentAdjustmentsForFinance } from '../../payment/payment.contract';
import { guardBalanceEvents } from '../application/finance-balance-rules';
import { guardFinanceEffectiveAccumulations } from './finance-composition.money';

jest.mock('../../payment/payment.contract', () => ({ ...jest.requireActual<typeof import('../../payment/payment.contract')>('../../payment/payment.contract'), readRecordedPaymentsForFinance: jest.fn(), readPaymentAdjustmentsForFinance: jest.fn() }));
jest.mock('../application/finance-balance-rules', () => ({ guardBalanceEvents: jest.fn() }));

function transaction(): Prisma.TransactionClient {
  return { $queryRaw: jest.fn().mockResolvedValue([{ expense: '100', paid: '20' }]), financeAccount: { findMany: jest.fn().mockResolvedValue([{ id: 'originalAccount', opening: { occurredAt: new Date('2026-01-01T00:00:00Z'), amountMinor: 0n } }, { id: 'refundAccount', opening: { occurredAt: new Date('2026-01-01T00:00:00Z'), amountMinor: 0n } }]) }, financeSettlement: { findMany: jest.fn().mockResolvedValue([]) }, financeTransfer: { findMany: jest.fn().mockResolvedValue([]) }, financeCashMovement: { findMany: jest.fn().mockResolvedValue([]) }, financePaymentLink: { findMany: jest.fn().mockResolvedValue([{ paymentId: 'payment', accountId: 'originalAccount', version: 1 }]) } } as unknown as Prisma.TransactionClient;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readRecordedPaymentsForFinance).mockResolvedValue([{ id: 'payment', bookingId: 'booking', amountMinor: 400, currency: 'PYG', paidAt: '2026-10-01T00:00:00Z', paymentVersion: 2, reference: null }]);
  jest.mocked(readPaymentAdjustmentsForFinance).mockResolvedValue([{ id: 'refund', paymentId: 'payment', bookingId: 'booking', kind: 'REFUND', amountMinor: 150, currency: 'PYG', occurredAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', accountId: 'refundAccount', sequence: 1 }]);
});

describe('public Payment accumulation composition', () => {
  it('counts a gross receipt and refund exactly once, using the refund own account', async () => {
    await guardFinanceEffectiveAccumulations(transaction(), 'business');
    expect(jest.mocked(guardBalanceEvents).mock.calls[0][0]).toEqual(expect.arrayContaining([{ accountId: 'originalAccount', instant: Date.parse('2026-10-01T00:00:00Z'), amount: 400n }, { accountId: 'refundAccount', instant: Date.parse('2026-10-02T00:00:00Z'), amount: -150n }]));
  });
  it('removes a void receipt without a bank VOID movement or transferring funds', async () => {
    jest.mocked(readPaymentAdjustmentsForFinance).mockResolvedValue([{ id: 'void', paymentId: 'payment', bookingId: 'booking', kind: 'VOID', amountMinor: 400, currency: 'PYG', occurredAt: '2026-10-01T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', accountId: null, sequence: 1 }]);
    await guardFinanceEffectiveAccumulations(transaction(), 'business');
    const events = jest.mocked(guardBalanceEvents).mock.calls[0][0];
    expect(events).toHaveLength(4);
    expect(events).toEqual(expect.arrayContaining([{ accountId: 'originalAccount', instant: Date.parse('2026-10-01T00:00:00Z'), amount: 400n }, { accountId: 'originalAccount', instant: Date.parse('2026-10-01T00:00:00Z'), amount: -400n }]));
    expect(events.reduce((sum, event) => sum + event.amount, 0n)).toBe(0n);
  });
  it('rejects a globally unsafe retained dimension even when each original is safe', async () => {
    const source = (await readRecordedPaymentsForFinance(transaction(), 'business'))[0];
    jest.mocked(readRecordedPaymentsForFinance).mockResolvedValue([{ ...source, amountMinor: Number.MAX_SAFE_INTEGER, paymentVersion: 1 }, { ...source, id: 'second', amountMinor: 1, paymentVersion: 1 }]);
    jest.mocked(readPaymentAdjustmentsForFinance).mockResolvedValue([]);
    await expect(guardFinanceEffectiveAccumulations(transaction(), 'business')).rejects.toThrow();
    expect(guardBalanceEvents).not.toHaveBeenCalled();
  });
  it('rejects a refund with missing own opening instead of silently omitting its outflow', async () => {
    const tx = transaction();
    jest.spyOn(tx.financeAccount, 'findMany').mockResolvedValue([]);
    await expect(guardFinanceEffectiveAccumulations(tx, 'business')).rejects.toThrow('apertura');
    expect(guardBalanceEvents).not.toHaveBeenCalled();
  });
  it('checks numeric SQL sums as text without overflowing PostgreSQL bigint first', async () => {
    const tx = transaction();
    jest.spyOn(tx, '$queryRaw').mockResolvedValue([{ expense: '100000000000000000000', paid: '0' }]);
    await expect(guardFinanceEffectiveAccumulations(tx, 'business')).rejects.toThrow('rango');
    expect(readRecordedPaymentsForFinance).not.toHaveBeenCalled();
  });
});
