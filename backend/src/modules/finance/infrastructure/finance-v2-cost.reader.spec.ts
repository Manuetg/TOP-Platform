import { readFinanceCostSources } from './finance-v2-cost.reader';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const input = { businessId: 'business1', from: '2026-10-01', to: '2026-11-01', asOf: '2026-10-05T12:00:00Z' };
function readerFixture() {
  const rows = { expense: [{ id: 'line1', amountMinor: 100001n, operational: true, resourceId: null, expenseVersion: 1, consumedOn: new Date('2026-10-05'), reference: null, hasPostCutMutation: false }], labor: [] as object[], allocations: [] as object[], parts: [] as object[] };
  const calls: { sql: string; parameters: readonly unknown[] }[] = [];
  const tx: FinanceSqlTransaction = { execute: () => Promise.reject(new Error('Reader must never write')), query: <T extends object>(sql: string, parameters: readonly unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes('FROM "FinanceExpenseLine"')) return Promise.resolve(rows.expense as unknown as T[]);
    if (sql.includes('FROM "FinanceLaborCost"')) return Promise.resolve(rows.labor as T[]);
    if (sql.includes('FROM "FinanceCostAllocationPart"')) return Promise.resolve(rows.parts as T[]);
    if (sql.includes('FROM "FinanceCostAllocation"')) return Promise.resolve(rows.allocations as T[]);
    return Promise.reject(new Error('Unexpected reader SQL'));
  } };
  return { rows, calls, tx };
}

describe('Finance V2 public cost source reader (unit SQL fixture)', () => {
  it('decomposes allocation and preserves exactly one source plus unassigned', async () => {
    const f = readerFixture();
    f.rows.allocations = [{ id: 'allocation1', sourceExpenseLineId: 'line1', sourceLaborRevisionId: null, sourceAmountMinor: 100001n, unassignedMinor: 1n, revisionNo: 1, ruleRevisionId: 'rule1', sourceHash: 'h1' }];
    f.rows.parts = [{ allocationId: 'allocation1', resourceId: 'resource1', amountMinor: 60000n }, { allocationId: 'allocation1', resourceId: 'resource2', amountMinor: 40000n }];
    const report = await readFinanceCostSources(f.tx, input);
    expect(report.costSources).toHaveLength(1);
    expect(report.costSources[0]).toMatchObject({ amountMinor: 100001, allocations: [{ resourceId: 'resource1', amountMinor: 60000 }, { resourceId: 'resource2', amountMinor: 40000 }, { resourceId: null, amountMinor: 1 }] });
    expect(report.coverage.missingEvidenceSourceIds).toEqual(['EXPENSE_LINE:line1']);
    expect(f.calls.every(call => call.parameters[0] === input.businessId && call.sql.includes('"businessId"'))).toBe(true);
  });
  it('does not add an estimated labor source when its actual expense already exists', async () => {
    const f = readerFixture();
    f.rows.labor = [{ id: 'labor1', revisionId: 'revision1', revisionNo: 1, kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: 'line1', estimatedMinor: 110000n, consumedOn: new Date('2026-10-05') }];
    const result = await readFinanceCostSources(f.tx, input);
    expect(result.costSources).toHaveLength(1);
    expect(result.costSources[0].sourceId).toBe('EXPENSE_LINE:line1');
  });
  it('keeps unknown cost in coverage and imputed owner work outside operating sources', async () => {
    const f = readerFixture();
    f.rows.labor = [{ id: 'labor1', revisionId: 'r1', revisionNo: 1, kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: null, consumedOn: new Date('2026-10-05') }, { id: 'owner1', revisionId: 'r2', revisionNo: 1, kind: 'OWNER_IMPUTED', actualExpenseLineId: null, estimatedMinor: 50000n, consumedOn: new Date('2026-10-05') }];
    const result = await readFinanceCostSources(f.tx, input);
    expect(result.costSources).toHaveLength(1);
    expect(result.ownerWorkSources).toHaveLength(1);
    expect(result.coverage.unknownSourceIds).toEqual(['LABOR_ESTIMATE:r1']);
  });
  it('rejects broken conservation and unsafe PYG instead of truncating or clamping', async () => {
    const f = readerFixture();
    f.rows.allocations = [{ id: 'a1', sourceExpenseLineId: 'line1', sourceLaborRevisionId: null, sourceAmountMinor: 100001n, unassignedMinor: 0n, revisionNo: 1, ruleRevisionId: 'rule1', sourceHash: 'h1' }];
    await expect(readFinanceCostSources(f.tx, input)).rejects.toThrow('conserva');
    f.rows.allocations = []; f.rows.expense[0].amountMinor = 9007199254740992n;
    await expect(readFinanceCostSources(f.tx, input)).rejects.toThrow();
  });
  it('token includes policy/allocation provenance even when amounts stay equal', async () => {
    const f = readerFixture();
    f.rows.allocations = [{ id: 'a1', sourceExpenseLineId: 'line1', sourceLaborRevisionId: null, sourceAmountMinor: 100001n, unassignedMinor: 100001n, revisionNo: 1, ruleRevisionId: 'rule1', sourceHash: 'h1' }];
    const before = await readFinanceCostSources(f.tx, input);
    f.rows.allocations = [{ ...f.rows.allocations[0], id: 'a2', revisionNo: 2, ruleRevisionId: 'rule2' }];
    const after = await readFinanceCostSources(f.tx, input);
    expect(before.costSources).toEqual(after.costSources);
    expect(before.token).not.toBe(after.token);
    await expect(readFinanceCostSources(f.tx, { ...input, sourceToken: before.token })).rejects.toThrow('cambió');
  });
});
