import { createHash } from 'node:crypto';
import { FinanceUseCases, stableFinanceJson, validateFinanceId } from './finance.use-cases';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import type { FinanceRepository, FinanceReport, FinanceResult, FinanceExpense, FinanceAuditItem } from '../domain/finance.types';

const actor = { businessId: '00000000-0000-4000-8000-000000000001', actorUserId: '00000000-0000-4000-8000-000000000002' };
const token = 'a'.repeat(64);

function report(): FinanceReport {
  return { businessId: actor.businessId, currency: 'PYG', timeZone: 'America/Asuncion', basis: 'REGISTERED_OPERATIONS', from: '2026-10-01', to: '2026-11-01', asOf: '2026-10-05T00:00:00Z', token, sourceLimit: 5000, catalogs: [], resources: [], accounts: [], expenses: [], movements: [], balanceSources: [], payments: [], cashCounts: [], totals: { expenseMinor: 0, operatingCostMinor: 0, paymentsMinor: 0, settlementsMinor: 0, outstandingMinor: 0, overdueMinor: 0, unassignedPaymentsMinor: 0, registeredBalanceMinor: null, grossRecordedAmountMinor: 0, voidedAmountMinor: 0, refundedAmountMinor: 0, netRecordedReceiptFlowMinor: 0, paymentNetRetainedAmountMinor: 0 }, coverage: { unconfiguredAccountIds: [], missingEvidenceExpenseIds: [], unknownHistoricalDebt: true, serviceRevenueAvailable: false } };
}

describe('Finance application orchestration', () => {
  let repository: jest.Mocked<FinanceRepository>;
  let useCases: FinanceUseCases;
  beforeEach(() => {
    repository = { execute: jest.fn<Promise<FinanceResult>, Parameters<FinanceRepository['execute']>>(), report: jest.fn<Promise<FinanceReport>, Parameters<FinanceRepository['report']>>(), expense: jest.fn<Promise<{ expense: FinanceExpense; audit: FinanceAuditItem[] }>, Parameters<FinanceRepository['expense']>>(), audit: jest.fn<Promise<FinanceAuditItem[]>, Parameters<FinanceRepository['audit']>>() };
    useCases = new FinanceUseCases(repository);
  });

  it('normalizes immutable intent before computing the stable fingerprint and forwarding the actor', async () => {
    const result: FinanceResult = { type: 'CREATE_CATALOG', id: 'catalog', version: 1 };
    repository.execute.mockResolvedValue(result);
    const key = 'finance-intent-0001';
    const command = { type: 'CREATE_CATALOG' as const, kind: 'CATEGORY' as const, name: '  Reparación  ' };
    await expect(useCases.execute(actor, command, key)).resolves.toEqual(result);
    const normalized = { ...command, name: 'Reparación' };
    expect(repository.execute.mock.calls[0]).toEqual([{ ...actor, command: normalized, idempotencyKey: key, fingerprint: createHash('sha256').update(stableFinanceJson(normalized)).digest('hex') }]);
  });

  it('rejects invalid commands, keys and context without touching persistence', async () => {
    await expect(useCases.execute(actor, { type: 'UNKNOWN' }, 'finance-intent-0001')).rejects.toBeInstanceOf(FinanceInputError);
    await expect(useCases.execute(actor, { type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'X' }, 'short')).rejects.toBeInstanceOf(FinanceInputError);
    await expect(useCases.execute({ ...actor, actorUserId: 'wrong' }, { type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'X' }, 'finance-intent-0001')).rejects.toBeInstanceOf(FinanceInputError);
    expect(repository.execute.mock.calls).toHaveLength(0);
  });

  it('forwards the validated pure-date query and tenant for report and detail', async () => {
    repository.report.mockResolvedValue(report());
    await expect(useCases.report(actor, '2026-10-01', '2026-11-01')).resolves.toEqual(report());
    expect(repository.report.mock.calls[0]).toEqual([actor, { from: '2026-10-01', to: '2026-11-01' }]);
    repository.expense.mockRejectedValue(new FinanceConflictError('Conflict'));
    await expect(useCases.expense(actor, actor.businessId)).rejects.toBeInstanceOf(FinanceConflictError);
    expect(repository.expense.mock.calls[0]).toEqual([actor, actor.businessId]);
    expect(() => useCases.expense(actor, 'wrong')).toThrow(FinanceInputError);
    expect(() => useCases.report(actor, '2026-10-01', '2026-10-01')).toThrow(FinanceInputError);
  });

  it('exports exactly the current report token and rejects changed sources', async () => {
    repository.report.mockResolvedValue(report());
    await expect(useCases.export(actor, '2026-10-01', '2026-11-01', token)).resolves.toContain('REGISTERED_OPERATIONS');
    repository.report.mockResolvedValue({ ...report(), token: 'b'.repeat(64) });
    await expect(useCases.export(actor, '2026-10-01', '2026-11-01', token)).rejects.toBeInstanceOf(FinanceConflictError);
  });

  it('validates the closed audit source catalogue and forwards the tenant', async () => {
    repository.audit.mockResolvedValue([]);
    await expect(useCases.audit(actor, 'PAYMENT', actor.businessId)).resolves.toEqual([]);
    expect(repository.audit.mock.calls[0]).toEqual([actor, 'PAYMENT', actor.businessId]);
    expect(() => useCases.audit(actor, 'UNKNOWN', actor.businessId)).toThrow(FinanceInputError);
    expect(() => useCases.audit(actor, null, actor.businessId)).toThrow(FinanceInputError);
    expect(() => useCases.audit(actor, 'PAYMENT', 'invalid')).toThrow(FinanceInputError);
  });

  it.each([undefined, 42, '', 'a'.repeat(63), 'Z'.repeat(64)])('rejects malformed export token %p before a query', async (invalid) => {
    await expect(useCases.export(actor, '2026-10-01', '2026-11-01', invalid)).rejects.toBeInstanceOf(FinanceInputError);
    expect(repository.report.mock.calls).toHaveLength(0);
  });

  it('keeps object ordering stable and array ordering meaningful', () => {
    expect(stableFinanceJson({ z: [null, { b: 2, a: 1 }], a: true })).toBe(stableFinanceJson({ a: true, z: [null, { a: 1, b: 2 }] }));
    expect(stableFinanceJson([1, 2])).not.toBe(stableFinanceJson([2, 1]));
    expect(validateFinanceId('ABCDEF12-ABCD-4ABC-8ABC-ABCDEF123456')).toBe('abcdef12-abcd-4abc-8abc-abcdef123456');
  });
});
