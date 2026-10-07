import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../business/business.contract';
import { appendPaymentAdjustment } from '../../payment/payment.contract';
import { appendTerminalFinalAmount } from '../../pricing/pricing.contract';
import { authorizeFinanceMembership } from './finance-prisma-context';
import { FinanceConflictError, FinanceForbiddenError } from '../domain/finance.errors';
import type { FinanceCorrectionMutation, FinanceCorrectionResult } from '../application/finance-corrections.port';
import { executeFinanceCorrection, PrismaFinanceCorrectionsRepository } from './prisma-finance-corrections.repository';

jest.mock('../../payment/payment.contract', () => ({ appendPaymentAdjustment: jest.fn() }));
jest.mock('../../pricing/pricing.contract', () => ({ appendTerminalFinalAmount: jest.fn() }));
jest.mock('./prisma-finance-corrections.reader', () => ({ readFinanceCorrections: jest.fn() }));
jest.mock('./finance-prisma-context', () => ({ authorizeFinanceMembership: jest.fn(), authorizeFinance: jest.fn(), financeJson: (value: unknown) => value }));

const bookingId = '11111111-1111-4111-8111-111111111111';
const paymentId = '22222222-2222-4222-8222-222222222222';
const currentPricingId = '33333333-3333-4333-8333-333333333333';
const amounts = { grossRecordedAmountMinor: 100, voidedAmountMinor: 100, refundedAmountMinor: 0, netRetainedAmountMinor: 0 };
const result = (): FinanceCorrectionResult => ({ id: 'adjustment', type: 'VOID_PAYMENT', version: 2, paymentVersion: 2, financialVersion: 2, bookingId, paymentId, currentPricingId, amounts, applicationReversals: [] });
const input = (): FinanceCorrectionMutation => ({ businessId: 'business', actorUserId: 'owner', idempotencyKey: 'same-key-1234567890', fingerprint: 'original-fingerprint', command: { type: 'VOID_PAYMENT', bookingId, paymentId, expectedBookingUpdatedAt: '2026-10-01T10:00:00.000Z', currentPricingId, expectedPaymentVersion: 1, expectedFinancialVersion: 1, reason: 'Corrección manual' } });

function fixture() {
  const events: string[] = []; const facts: string[] = [];
  const requestFind = jest.fn<Promise<{ fingerprint: string; result: FinanceCorrectionResult } | null>, [unknown]>().mockImplementation(() => { events.push('request-read'); return Promise.resolve(null); });
  const auditCreate = jest.fn<Promise<{ id: string }>, [unknown]>().mockImplementation(() => { events.push('audit'); facts.push('audit'); return Promise.resolve({ id: 'audit' }); });
  const requestCreate = jest.fn<Promise<{ id: string }>, [unknown]>().mockImplementation(() => { events.push('request'); facts.push('request'); return Promise.resolve({ id: 'request' }); });
  const executeRaw = jest.fn<Promise<number>, [unknown, ...unknown[]]>().mockImplementation(() => { events.push('key-lock'); return Promise.resolve(1); });
  const tx = { $executeRaw: executeRaw, financeRequest: { findUnique: requestFind, create: requestCreate }, financeAudit: { create: auditCreate } } as unknown as Prisma.TransactionClient;
  const guard = jest.fn<Promise<void>, [Prisma.TransactionClient, string]>().mockImplementation(() => { events.push('accumulation-guard'); return Promise.resolve(); });
  jest.mocked(authorizeFinanceMembership).mockImplementation(() => { events.push('authority'); return Promise.resolve(); });
  jest.mocked(appendPaymentAdjustment).mockImplementation(() => { events.push('payment-owned-writer'); facts.push('adjustment'); return Promise.resolve(result() as Awaited<ReturnType<typeof appendPaymentAdjustment>>); });
  const transaction = jest.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<FinanceCorrectionResult>) => {
    const before = [...facts];
    try { return await operation(tx); } catch (error: unknown) { facts.splice(0, facts.length, ...before); throw error; }
  });
  const repository = new PrismaFinanceCorrectionsRepository({ $transaction: transaction } as unknown as PrismaService, guard);
  return { events, facts, tx, guard, requestFind, auditCreate, requestCreate, executeRaw, transaction, repository };
}

describe('Finance correction orchestration with a mock transaction (no PostgreSQL evidence)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('locks a business-operation key, revalidates authority, and writes audit/request after the Payment-owned fact', async () => {
    const scope = fixture();
    expect(await executeFinanceCorrection(scope.tx, input(), scope.guard)).toEqual(result());
    expect(scope.events).toEqual(['key-lock', 'authority', 'request-read', 'payment-owned-writer', 'accumulation-guard', 'audit', 'request']);
    const writerCall = jest.mocked(appendPaymentAdjustment).mock.calls[0];
    expect(writerCall[1].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(scope.requestCreate.mock.calls[0][0]).toMatchObject({ data: { id: writerCall[1].requestId, operation: 'VOID_PAYMENT', businessId: 'business', fingerprint: 'original-fingerprint' } });
    expect(scope.executeRaw.mock.calls[0][1]).toBe('business:finance:VOID_PAYMENT:same-key-1234567890');
  });

  it('recovers an original response after later state changes without invoking the economic writer', async () => {
    const scope = fixture();
    scope.requestFind.mockResolvedValue({ fingerprint: input().fingerprint, result: result() });
    expect(await executeFinanceCorrection(scope.tx, input(), scope.guard)).toEqual(result());
    expect(scope.events).toEqual(['key-lock', 'authority']);
    expect(appendPaymentAdjustment).not.toHaveBeenCalled(); expect(scope.guard).not.toHaveBeenCalled(); expect(scope.auditCreate).not.toHaveBeenCalled();
  });

  it('denies a revoked actor before reading an existing idempotent response', async () => {
    const scope = fixture();
    jest.mocked(authorizeFinanceMembership).mockRejectedValue(new FinanceForbiddenError('Revocado'));
    await expect(executeFinanceCorrection(scope.tx, input(), scope.guard)).rejects.toThrow(FinanceForbiddenError);
    expect(scope.requestFind).not.toHaveBeenCalled(); expect(appendPaymentAdjustment).not.toHaveBeenCalled();
  });

  it('rejects a second payload inside the same operation namespace before any writer', async () => {
    const scope = fixture(); scope.requestFind.mockResolvedValue({ fingerprint: 'another', result: result() });
    await expect(executeFinanceCorrection(scope.tx, input(), scope.guard)).rejects.toThrow(FinanceConflictError);
    expect(appendPaymentAdjustment).not.toHaveBeenCalled(); expect(scope.requestCreate).not.toHaveBeenCalled();
  });

  it.each(['guard', 'audit', 'request'])('propagates a %s failure through the one transaction and does not return a success', async (failure) => {
    const scope = fixture();
    if (failure === 'guard') scope.guard.mockRejectedValue(new Error('guard-failure'));
    if (failure === 'audit') scope.auditCreate.mockRejectedValue(new Error('audit-failure'));
    if (failure === 'request') scope.requestCreate.mockRejectedValue(new Error('request-failure'));
    await expect(scope.repository.execute(input())).rejects.toThrow(`${failure}-failure`);
    expect(scope.transaction).toHaveBeenCalledTimes(1); expect(scope.facts).toEqual([]);
  });

  it('keeps terminal agreement and Payment correction namespaces separate and delegates to public Pricing only', async () => {
    const scope = fixture();
    const command: FinanceCorrectionMutation = { ...input(), command: { type: 'SET_TERMINAL_FINAL_AMOUNT', bookingId, expectedBookingUpdatedAt: '2026-10-01T10:00:00.000Z', currentPricingId, expectedFinancialVersion: 1, finalAmountMinor: 0, reason: 'Acuerdo final manual' } };
    jest.mocked(appendTerminalFinalAmount).mockResolvedValue({ id: 'revision', type: 'SET_TERMINAL_FINAL_AMOUNT', version: 1, bookingId, currentPricingId: 'revision', pricingRevisionId: 'revision', revisionNumber: 1, totalAmountMinor: 0, financialVersion: 1, amounts: { ...amounts, financialVersion: 1 }, bookingUpdatedAt: '2026-10-02T10:00:00.000Z' });
    await executeFinanceCorrection(scope.tx, command, scope.guard);
    expect(appendPaymentAdjustment).not.toHaveBeenCalled(); expect(appendTerminalFinalAmount).toHaveBeenCalledTimes(1);
    expect(scope.executeRaw.mock.calls[0][1]).toBe('business:finance:SET_TERMINAL_FINAL_AMOUNT:same-key-1234567890');
  });
});
