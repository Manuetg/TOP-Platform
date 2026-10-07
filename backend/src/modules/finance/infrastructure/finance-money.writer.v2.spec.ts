import { writeFinanceMoney } from './finance-money.writer';
import { readFinancePaymentCashSources } from './finance-payment-cash.sources';
import type { FinanceTransaction } from './finance-prisma-context';
import type { FinanceMutation } from '../domain/finance.types';
import { FinanceConflictError } from '../domain/finance.errors';

jest.mock('./finance-payment-cash.sources', () => ({ ...jest.requireActual<typeof import('./finance-payment-cash.sources')>('./finance-payment-cash.sources'), readFinancePaymentCashSources: jest.fn() }));
const readSources = jest.mocked(readFinancePaymentCashSources);

describe('cash V1 LINK_PAYMENT preserves corrections', () => {
  it('rejects a new VOIDED link before account queries, mutations and audit', async () => {
    const paidAt = '2026-10-01T00:00:00Z';
    readSources.mockResolvedValue({ payments: [{ id: 'payment', bookingId: 'booking', amountMinor: 400, currency: 'PYG', paidAt, reference: null, paymentVersion: 2 }], paymentAdjustments: [{ id: 'void', paymentId: 'payment', bookingId: 'booking', kind: 'VOID', amountMinor: 400, currency: 'PYG', occurredAt: paidAt, createdAt: '2026-10-02T00:00:00Z', accountId: null, sequence: 1 }] });
    const accountRead = jest.fn(); const linkWrite = jest.fn(); const auditWrite = jest.fn();
    const tx = { financeAccount: { findFirst: accountRead }, financePaymentLink: { create: linkWrite, update: linkWrite }, financeAudit: { create: auditWrite } } as unknown as FinanceTransaction;
    const input = { businessId: 'business', actorUserId: 'owner' } as FinanceMutation;
    await expect(writeFinanceMoney(tx, input, { type: 'LINK_PAYMENT', paymentId: 'payment', accountId: 'account', expectedVersion: 0, reason: 'Asignación' })).rejects.toBeInstanceOf(FinanceConflictError);
    expect(accountRead).not.toHaveBeenCalled(); expect(linkWrite).not.toHaveBeenCalled(); expect(auditWrite).not.toHaveBeenCalled();
  });
  it('keeps a non-PYG historical source as conflict rather than input conversion', async () => {
    readSources.mockResolvedValue({ payments: [{ id: 'payment', bookingId: 'booking', amountMinor: 400, currency: 'USD', paidAt: '2026-10-01T00:00:00Z', reference: null, paymentVersion: 1 }], paymentAdjustments: [] });
    await expect(writeFinanceMoney({} as FinanceTransaction, { businessId: 'business' } as FinanceMutation, { type: 'LINK_PAYMENT', paymentId: 'payment', accountId: 'account', expectedVersion: 0, reason: 'Asignación' })).rejects.toBeInstanceOf(FinanceConflictError);
  });
});
