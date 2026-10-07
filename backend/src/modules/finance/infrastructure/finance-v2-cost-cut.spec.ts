import { readFinanceCostSources } from './finance-v2-cost.reader';
import { readFinanceV2CostReport } from './finance-v2-cost.report-reader';
import { FinanceCostSourceStaleError, financeReportCut } from './finance-v2-report.cut';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const input = { businessId: 'biz', timeZone: 'America/Asuncion', from: '2026-10-01', to: '2026-11-01', asOf: '2026-10-05T15:00:00+03:00' };
const cut = '2026-10-05T12:00:00.000Z';
const before = new Date('2026-10-05T11:59:59Z');
const after = new Date('2026-10-05T12:00:01Z');

/** The fixture applies the requested cut only when SQL supplies the required predicate. */
function fixture() {
  const expense = [
    { id: 'line1', expenseId: 'expense1', amountMinor: 100n, operational: true, resourceId: null, bookingId: null, categoryId: 'cat', version: 1, expenseVersion: 1, consumedOn: new Date('2026-10-05'), reference: 'receipt', createdAt: before, hasPostCutMutation: false },
    { id: 'future', expenseId: 'expense2', amountMinor: 1000n, operational: true, resourceId: null, bookingId: null, categoryId: 'cat', version: 1, expenseVersion: 1, consumedOn: new Date('2026-10-05'), reference: 'later', createdAt: after, hasPostCutMutation: false },
  ];
  const labor = [
    { id: 'labor1', revisionId: 'r1', revisionNo: 1, kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: 80n, consumedOn: new Date('2026-10-05'), createdAt: before, revisionCreatedAt: before },
    { id: 'labor1', revisionId: 'r2', revisionNo: 2, kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: 800n, consumedOn: new Date('2026-10-05'), createdAt: before, revisionCreatedAt: after },
    { id: 'futureLabor', revisionId: 'r3', revisionNo: 1, kind: 'OWNER_IMPUTED', actualExpenseLineId: null, estimatedMinor: 8000n, consumedOn: new Date('2026-10-05'), createdAt: after, revisionCreatedAt: after },
  ];
  const allocations = [
    { id: 'a1', sourceExpenseLineId: 'line1', sourceLaborRevisionId: null, sourceAmountMinor: 100n, unassignedMinor: 40n, revisionNo: 1, ruleRevisionId: 'rule1', ruleId: 'rule', ruleVersion: 1, sourceHash: 'h1', createdAt: before, ruleCreatedAt: before },
    { id: 'a2', sourceExpenseLineId: 'line1', sourceLaborRevisionId: null, sourceAmountMinor: 100n, unassignedMinor: 0n, revisionNo: 2, ruleRevisionId: 'rule2', ruleId: 'rule', ruleVersion: 2, sourceHash: 'h2', createdAt: after, ruleCreatedAt: after },
  ];
  const parts = [
    { allocationId: 'a1', resourceId: 'resource1', amountMinor: 60n, createdAt: before },
    { allocationId: 'a2', resourceId: 'resource2', amountMinor: 100n, createdAt: after },
  ];
  const calls: { sql: string; parameters: readonly unknown[] }[] = [];
  const state = { missingDetail: false, detailVersion: 1 };
  const tx: FinanceSqlTransaction = {
    execute: () => Promise.reject(new Error('Read must not write')),
    query: <T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> => {
      calls.push({ sql, parameters });
      const currentCut = new Date(parameters[parameters.length - 1] as string);
      let result: object[];
      if (sql.includes('FROM "FinanceExpenseLine"')) {
        expect(sql).toContain('e."createdAt"<=$4::timestamp');
        const selected = expense.filter(row => row.createdAt <= currentCut);
        if (sql.includes('AS "expenseVersion"')) {
          expect(sql).toContain('audit."occurredAt">$4::timestamp');
          result = selected;
        } else result = state.missingDetail ? [] : selected.map(row => ({ ...row, version: state.detailVersion }));
      } else if (sql.includes('FROM "FinanceLaborCost"')) {
        expect(sql).toContain('l."createdAt"<=$4::timestamp');
        expect(sql).toContain('r."createdAt"<=$4::timestamp');
        result = latest(labor.filter(row => row.createdAt <= currentCut && row.revisionCreatedAt <= currentCut), row => row.id);
      } else if (sql.includes('FROM "FinanceCostAllocationPart"')) {
        expect(sql).toContain('"createdAt"<=$3::timestamp');
        const ids = parameters[1] as string[];
        result = parts.filter(row => ids.includes(row.allocationId) && row.createdAt <= currentCut);
      } else if (sql.includes('FROM "FinanceCostAllocation"')) {
        expect(sql).toContain('a."createdAt"<=$4::timestamp');
        expect(sql).toContain('r."createdAt"<=$4::timestamp');
        const expenseIds = parameters[1] as string[];
        const laborIds = parameters[2] as string[];
        result = latest(allocations.filter(row => (expenseIds.includes(row.sourceExpenseLineId) || laborIds.includes(row.sourceLaborRevisionId ?? '')) && row.createdAt <= currentCut && row.ruleCreatedAt <= currentCut), row => row.sourceExpenseLineId);
      } else return Promise.reject(new Error(`Unexpected SQL: ${sql}`));
      return Promise.resolve(result as T[]);
    },
  };
  return { tx, calls, expense, state };
}

function latest<T extends { revisionNo: number }>(rows: T[], key: (row: T) => string): T[] {
  const selected = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.revisionNo - a.revisionNo)) if (!selected.has(key(row))) selected.set(key(row), row);
  return [...selected.values()];
}

describe('cost source/report asOf cut', () => {
  it('excludes later facts and selects labor/allocation revisions visible at the cut', async () => {
    const f = fixture();
    const report = await readFinanceV2CostReport(f.tx, input);
    expect(report.totals).toEqual({ actualCostMinor: 100, estimatedSelectedMinor: 80, ownerImputedMinor: 0, unknownSourceCount: 0 });
    expect(report.rows.find(row => row.expenseLineId === 'line1')).toMatchObject({ amountMinor: 100, ruleVersion: 1, allocationVersion: 1, destinations: [{ resourceId: 'resource1', amountMinor: 60 }], unassignedMinor: 40 });
    expect(report.rows.some(row => row.source.id === 'future' || row.source.id === 'futureLabor')).toBe(false);
    expect(f.calls.every(call => call.parameters.at(-1) === cut && call.parameters[0] === input.businessId)).toBe(true);
    const allocationCalls = f.calls.filter(call => call.sql.includes('FROM "FinanceCostAllocation"'));
    expect(allocationCalls).toHaveLength(2);
    expect(allocationCalls.every(call => JSON.stringify(call.parameters.slice(1, 3)) === JSON.stringify([['line1'], ['r1']]))).toBe(true);
  });

  it('keeps equal instants and unchanged cuts on the same canonical source token', async () => {
    const f = fixture();
    const offset = await readFinanceCostSources(f.tx, input);
    const utc = await readFinanceCostSources(f.tx, { ...input, asOf: cut, sourceToken: offset.token });
    expect(utc.token).toBe(offset.token);
  });

  it('requires refresh when a later cut exposes a new fact/revision', async () => {
    const f = fixture();
    const earlier = await readFinanceCostSources(f.tx, input);
    await expect(readFinanceCostSources(f.tx, { ...input, asOf: '2026-10-06T00:00:00Z', sourceToken: earlier.token })).rejects.toThrow('cambió');
  });

  it('fails closed for current Expense metadata/version changed after the cut', async () => {
    const f = fixture();
    f.expense[0].hasPostCutMutation = true;
    await expect(readFinanceCostSources(f.tx, input)).rejects.toMatchObject({ code: 'SOURCE_STALE' });
    expect(f.calls).toHaveLength(1);
  });

  it.each(['missing', 'version'])('rejects %s source/detail mismatch with SOURCE_STALE', async mode => {
    const f = fixture();
    if (mode === 'missing') f.state.missingDetail = true;
    else f.state.detailVersion = 2;
    await expect(readFinanceV2CostReport(f.tx, input)).rejects.toBeInstanceOf(FinanceCostSourceStaleError);
  });

  it.each(['2026-10-05T12:00:00', '2026-02-30T12:00:00Z', '2026-10-05T24:00:00Z', '2026-10-05T12:60:00Z', '2026-10-05T12:00:60Z', '2026-10-05T12:00:00+14:01', '2026-10-05T12:00:00+03:99'])('rejects invalid or ambiguous cut %s before SQL', async asOf => {
    const f = fixture();
    await expect(readFinanceV2CostReport(f.tx, { ...input, asOf })).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });

  it('normalizes explicit offsets without losing the original instant', () => {
    expect(financeReportCut(input.asOf)).toBe(cut);
    expect(financeReportCut('2026-10-05T09:00:00-03:00')).toBe(cut);
  });
});
