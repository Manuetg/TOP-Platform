import { guardFinanceAccumulations } from './finance-accumulation.guard';
import { readFinancePaymentCashSources } from './finance-payment-cash.sources';
import type { FinanceTransaction } from './finance-prisma-context';
import type { FinancePaymentSource, FinancePaymentAdjustmentSource } from '../../payment/payment.contract';
import { FinanceConflictError } from '../domain/finance.errors';

jest.mock('./finance-payment-cash.sources', () => ({ ...jest.requireActual<typeof import('./finance-payment-cash.sources')>('./finance-payment-cash.sources'), readFinancePaymentCashSources: jest.fn() }));
const readSources = jest.mocked(readFinancePaymentCashSources);
const occurredAt = '2026-10-01T00:00:00Z';
function original(id: string, paymentVersion: number): FinancePaymentSource { return { id, bookingId: `booking-${id}`, amountMinor: Number.MAX_SAFE_INTEGER, currency: 'PYG', paidAt: occurredAt, reference: null, paymentVersion }; }
function voided(payment: FinancePaymentSource): FinancePaymentAdjustmentSource { return { id: `void-${payment.id}`, paymentId: payment.id, bookingId: payment.bookingId, kind: 'VOID', amountMinor: payment.amountMinor, currency: 'PYG', occurredAt, createdAt: '2026-10-02T00:00:00Z', accountId: null, sequence: 1 }; }
function transaction(payments: FinancePaymentSource[]): FinanceTransaction {
  const rows = (data: unknown[]) => ({ findMany: jest.fn().mockResolvedValue(data) });
  return { $queryRaw: jest.fn().mockResolvedValue([{ expense: '0', paid: '0' }]), financeAccount: rows([{ id: 'account', opening: { amountMinor: 0n, occurredAt: new Date('2026-01-01') } }]), financeSettlement: rows([]), financeTransfer: rows([]), financeCashMovement: rows([]), financePaymentLink: rows(payments.map(payment => ({ paymentId: payment.id, accountId: 'account', version: 1 }))) } as unknown as FinanceTransaction;
}

describe('cash V1 canonical accumulation guard', () => {
  beforeEach(() => jest.clearAllMocks());
  it('allows historical gross above the safe sum when immutable void pairs retain zero', async () => {
    const payments = [original('one', 2), original('two', 2)];
    readSources.mockResolvedValue({ payments, paymentAdjustments: payments.map(voided) });
    await expect(guardFinanceAccumulations(transaction(payments), 'business')).resolves.toBeUndefined();
  });
  it('rejects a current retained sum above the safe money range', async () => {
    const payments = [original('one', 1), original('two', 1)];
    readSources.mockResolvedValue({ payments, paymentAdjustments: [] });
    await expect(guardFinanceAccumulations(transaction(payments), 'business')).rejects.toBeInstanceOf(FinanceConflictError);
  });
  it('fails closed when a refund lacks the opening of its own account', async () => {
    const payment = { ...original('one', 2), amountMinor: 400 };
    readSources.mockResolvedValue({ payments: [payment], paymentAdjustments: [{ ...voided(payment), id: 'refund', kind: 'REFUND', amountMinor: 150, accountId: 'missing-account', occurredAt: '2026-10-02T00:00:00Z' }] });
    await expect(guardFinanceAccumulations(transaction([payment]), 'business')).rejects.toBeInstanceOf(FinanceConflictError);
  });
});
