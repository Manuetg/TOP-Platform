import type { FinanceCostReport, FinanceCostRow } from '../domain/finance-v2.types';
import type { readFinanceRecognitionProjection } from './finance-recognition.report';
import { composeFinanceResourceResults } from './finance-composition.resource';

const input = { businessId: 'business', timeZone: 'UTC', from: '2026-10-01', to: '2026-11-01', asOf: '2026-11-05T00:00:00Z' };
function recognized(complete = true): Awaited<ReturnType<typeof readFinanceRecognitionProjection>> {
  const row = { resourceId: 'room', serviceRevenueMinor: 100, terminalRevenueMinor: 20, costMinor: 55, resultMinor: 65, marginBasisPoints: 5416 };
  return { token: 'recognition-token', rows: [row], totals: { ...row, resourceId: null }, coverage: { complete, pendingByReason: complete ? {} : { SERVICE_NOT_CERTIFIED: 1 } } } as unknown as Awaited<ReturnType<typeof readFinanceRecognitionProjection>>;
}
function costRow(id: string, amountMinor: number | null, kind: FinanceCostRow['kind'], basis: FinanceCostRow['basis']): FinanceCostRow {
  return { source: { kind: kind === 'OWNER_WORK' ? 'OWNER_IMPUTED' : basis === 'ESTIMATE' ? 'LABOR_ESTIMATE' : 'EXPENSE_LINE', id, version: 1, hash: id }, expenseId: null, expenseLineId: null, bookingId: null, resourceId: kind === 'DIRECT' ? 'room' : null, categoryId: null, consumedOn: '2026-10-02', basis, kind, amountMinor, ruleId: null, ruleVersion: null, allocationVersion: 0, destinations: amountMinor === null ? [] : [{ resourceId: 'room', amountMinor }], unassignedMinor: amountMinor === null ? null : 0 };
}
function costs(): FinanceCostReport {
  return { ...input, currency: 'PYG', token: 'cost-token', sourceLimit: 5000, basis: 'SOURCE_COSTS', rows: [costRow('direct', 30, 'DIRECT', 'ACTUAL'), costRow('common', 10, 'COMMON', 'ACTUAL'), costRow('estimate', 15, 'LABOR', 'ESTIMATE'), costRow('owner', 5, 'OWNER_WORK', 'ESTIMATE')], totals: { actualCostMinor: 40, estimatedSelectedMinor: 15, ownerImputedMinor: 5, unknownSourceCount: 0 }, coverage: { missingEvidenceSourceIds: [], unknownSourceIds: [], unsupportedReasons: [] } };
}

describe('resource composition financial bases', () => {
  it('keeps certified service plus terminal residual separate from actual, selected estimate and owner work', () => {
    const result = composeFinanceResourceResults(input, recognized(), costs());
    expect(result.business).toMatchObject({ recognizedRevenueMinor: 120, directActualCostMinor: 30, commonActualCostMinor: 10, selectedEstimatedCostMinor: 15, ownerImputedMinor: 5, contributionMinor: 90, operatingResultBeforeOwnerWorkMinor: 65, resultAfterOwnerWorkMinor: 60, marginBasisPoints: 5416, status: 'ESTIMATED' });
    expect(result.rows[0]).toEqual({ ...result.business, resourceId: 'room' });
  });
  it('suppresses profit and margin for unknown cost instead of inventing a complete zero', () => {
    const source = costs(); source.rows.push(costRow('unknown', null, 'LABOR', 'ESTIMATE')); source.coverage.unknownSourceIds = ['LABOR_ESTIMATE:unknown'];
    const result = composeFinanceResourceResults(input, recognized(), source);
    expect(result.business).toMatchObject({ directActualCostMinor: 30, status: 'INCOMPLETE', contributionMinor: null, operatingResultBeforeOwnerWorkMinor: null, resultAfterOwnerWorkMinor: null, marginBasisPoints: null });
    expect(result.business.reasons).toContain('UNKNOWN_COST:LABOR_ESTIMATE:unknown');
  });
  it('preserves pending recognition as incomplete even when known booked revenue is positive', () => {
    const result = composeFinanceResourceResults(input, recognized(false), costs());
    expect(result.business.operatingResultBeforeOwnerWorkMinor).toBeNull();
    expect(result.coverage.pendingRecognition).toEqual(['SERVICE_NOT_CERTIFIED']);
  });
  it('has a stable evidence token without changing asOf and rejects stale expected tokens', () => {
    const original = composeFinanceResourceResults(input, recognized(), costs());
    const later = composeFinanceResourceResults({ ...input, asOf: '2026-11-06T00:00:00Z' }, recognized(), costs());
    expect(original.token).toBe(later.token);
    expect(() => composeFinanceResourceResults({ ...input, sourceToken: 'bad' }, recognized(), costs())).toThrow();
  });
});
