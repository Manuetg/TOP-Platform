import { applyCommonCostRule, requireCostConservation, selectLaborSource, type CommonCostSource, type ScopedAllocationRule } from './finance-v2-cost.rules';

const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
const source: CommonCostSource = { id: 'line1', businessId: 'business1', version: 1, amountMinor: 1000000, consumedOn: '2026-10-05', resourceId: null, bookingId: null, operational: true };
const rule: ScopedAllocationRule = { id: '00000000-0000-4000-8000-000000000004', businessId: 'business1', version: 1, validFrom: '2026-10-01', validTo: '2026-11-01', parts: ids.map((resourceId, index) => ({ resourceId, basisPoints: [6000, 3000, 1000][index] })) };

describe('Finance V2 cost sources and allocation', () => {
  it('reuses existing exact allocation for an operational common source', () => {
    expect(applyCommonCostRule(source, rule, 'business1', 1, ids)).toMatchObject({ allocations: [{ resourceId: ids[0], amountMinor: 600000 }, { resourceId: ids[1], amountMinor: 300000 }, { resourceId: ids[2], amountMinor: 100000 }], unassignedMinor: 0 });
  });
  it('preserves deterministic remainder and unassigned source conservation', () => {
    const result = applyCommonCostRule({ ...source, amountMinor: 100001 }, { ...rule, parts: ids.map(resourceId => ({ resourceId, basisPoints: 3333 })) }, 'business1', 1, ids);
    expect(result).toMatchObject({ allocations: [{ resourceId: ids[0], amountMinor: 33330 }, { resourceId: ids[1], amountMinor: 33330 }, { resourceId: ids[2], amountMinor: 33330 }], unassignedMinor: 11 });
    expect(applyCommonCostRule({ ...source, amountMinor: 101 }, { ...rule, parts: ids.map(resourceId => ({ resourceId, basisPoints: 3333 })) }, 'business1', 1, ids)).toMatchObject({ allocations: [{ resourceId: ids[0], amountMinor: 34 }, { resourceId: ids[1], amountMinor: 33 }, { resourceId: ids[2], amountMinor: 33 }], unassignedMinor: 1 });
    expect(() => requireCostConservation(100001, result.allocations.map(row => row.amountMinor), result.unassignedMinor)).not.toThrow();
    expect(() => requireCostConservation(100001, [100000], 0)).toThrow('conserva');
  });
  it('rejects resource and rule references from another tenant', () => {
    expect(() => applyCommonCostRule(source, { ...rule, businessId: 'business2' }, 'business1', 1, ids)).toThrow('no disponible');
    expect(() => applyCommonCostRule(source, rule, 'business1', 1, ids.slice(0, 2))).toThrow('Recurso');
  });
  it.each([{ resourceId: ids[0] }, { bookingId: 'booking1' }, { operational: false }])('does not apply common cost on an already direct or excluded source: %o', change => {
    expect(() => applyCommonCostRule({ ...source, ...change }, rule, 'business1', 1, ids)).toThrow('sin asignación');
  });
  it('keeps null cost distinct from known zero and rejects stale version first', () => {
    expect(() => applyCommonCostRule({ ...source, amountMinor: null }, rule, 'business1', 1, ids)).toThrow('desconocido');
    expect(() => applyCommonCostRule({ ...source, amountMinor: 0 }, rule, 'business1', 1, ids)).toThrow('positivo');
    expect(() => applyCommonCostRule(source, rule, 'business1', 0, ids)).toThrow('versión');
    expect(() => applyCommonCostRule({ ...source, consumedOn: '2026-11-01' }, rule, 'business1', 1, ids)).toThrow('vigencia');
  });
  it('selects real labor from its existing expense source without adding estimate', () => {
    expect(selectLaborSource({ expenseLineId: 'one', amountMinor: 3000000 }, { revisionId: 'estimate1', amountMinor: 3200000 })).toEqual({ amountMinor: 3000000, basis: 'ACTUAL', sourceKey: 'EXPENSE_LINE:one' });
    expect(selectLaborSource({ expenseLineId: 'one', amountMinor: 0 }, { revisionId: 'estimate1', amountMinor: 3200000 })).toMatchObject({ amountMinor: 0, basis: 'ACTUAL' });
    expect(selectLaborSource(null, { revisionId: 'estimate1', amountMinor: 3200000 })).toMatchObject({ amountMinor: 3200000, basis: 'ESTIMATE' });
    expect(selectLaborSource(null, null)).toEqual({ amountMinor: null, basis: 'UNKNOWN', sourceKey: null });
  });
});
