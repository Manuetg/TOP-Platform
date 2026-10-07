import { Capability } from '../../../shared/application/authorization-policy';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { financeCommandCapability, requireDistinctAccounts, requireExpenseLines, requireFinanceOpening, requireFinancePaymentCurrency, requireFinanceSourceLimit, requireFinanceVersion, requireSettlementAvailable } from './finance-command-rules';

describe('Finance command invariants', () => {
  it('checks exact CAS even before no-op', () => {
    expect(() => requireFinanceVersion(2, 2)).not.toThrow();
    expect(() => requireFinanceVersion(2, 1)).toThrow(FinanceConflictError);
  });
  it('requires an explicit opening and admits its exact instant', () => {
    const cut = new Date('2026-10-01T00:00:00Z');
    expect(() => requireFinanceOpening(null, cut)).toThrow(FinanceConflictError);
    expect(() => requireFinanceOpening({ occurredAt: cut }, new Date(cut.getTime() - 1))).toThrow(FinanceInputError);
    expect(() => requireFinanceOpening({ occurredAt: cut }, cut)).not.toThrow();
    expect(() => requireFinanceOpening({ occurredAt: cut }, new Date(cut.getTime() + 1))).not.toThrow();
  });
  it('requires exact lines and detects one-guarani differences', () => {
    const line = { label: 'Trabajo', categoryId: 'category', resourceId: null, operational: true, amountMinor: 60000 };
    expect(() => requireExpenseLines(100001, [line, { ...line, amountMinor: 40001 }])).not.toThrow();
    expect(() => requireExpenseLines(100001, [line, { ...line, amountMinor: 40000 }])).toThrow(FinanceInputError);
    expect(() => requireExpenseLines(Number.MAX_SAFE_INTEGER, [{ ...line, amountMinor: Number.MAX_SAFE_INTEGER }, line])).toThrow(FinanceInputError);
  });
  it('limits settlements by obligation without imposing an account overdraft policy', () => {
    expect(() => requireSettlementAvailable(900000, 300000, 600000)).not.toThrow();
    expect(() => requireSettlementAvailable(900000, 300000, 600001)).toThrow(FinanceConflictError);
    expect(() => requireSettlementAvailable(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1)).toThrow(FinanceInputError);
  });
  it('does not admit same-account transfers or truncated source sets', () => {
    expect(() => requireDistinctAccounts('a', 'b')).not.toThrow();
    expect(() => requireDistinctAccounts('a', 'a')).toThrow(FinanceInputError);
    expect(() => requireFinanceSourceLimit(5000, 5000)).not.toThrow();
    expect(() => requireFinanceSourceLimit(5001, 5000)).toThrow(FinanceConflictError);
  });
  it('requires the separate capability for adjustments', () => {
    expect(financeCommandCapability({ type: 'ADJUST_COUNT', id: 'id', expectedVersion: 1, reason: 'Diferencia' })).toBe(Capability.FINANCE_CASH_ADJUST);
    const command = { type: 'CASH_MOVEMENT' as const, accountId: 'id', amountMinor: 1, occurredAt: 'instant', reason: 'Aporte', openingId: null };
    expect(financeCommandCapability({ ...command, kind: 'ADJUSTMENT' })).toBe(Capability.FINANCE_CASH_ADJUST);
    expect(financeCommandCapability({ ...command, kind: 'CONTRIBUTION' })).toBe(Capability.FINANCE_WRITE);
    expect(financeCommandCapability({ type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'Reparaciones' })).toBe(Capability.FINANCE_WRITE);
  });
  it('never relabels incompatible historical Payment currencies as PYG', () => {
    expect(() => requireFinancePaymentCurrency([])).not.toThrow();
    expect(() => requireFinancePaymentCurrency([{ currency: 'PYG' }])).not.toThrow();
    expect(() => requireFinancePaymentCurrency([{ currency: 'PYG' }, { currency: 'USD' }])).toThrow(FinanceConflictError);
  });
});
