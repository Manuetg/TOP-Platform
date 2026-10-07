import { readFinanceV2CloseSources } from './finance-v2-close.reader';
import type { FinanceSqlTransaction } from './finance-v2.repository';

describe('Finance V2 close supplemental snapshot (SQL port fixtures, no PostgreSQL)', () => {
  const input = { businessId: 'tenant-a', from: '2026-09-01', to: '2026-10-01', asOf: '2026-10-05T10:00:00.000Z' };
  function fixture(data: Record<string, unknown>[], table = 'FinanceBudget') {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const tx: FinanceSqlTransaction = { execute: () => Promise.reject(new Error('READ_ONLY')), query: <T extends object>(sql: string, params: readonly unknown[]) => { calls.push({ sql, params }); return Promise.resolve((sql.includes(`FROM "${table}"`) ? data : []) as T[]); } };
    return { tx, calls };
  }
  it('serializes money exactly and binds every table read to one tenant/cut', async () => {
    const f = fixture([{ id: 'budget-a', version: 3, approvedMinor: 9007199254740991n, createdAt: new Date('2026-09-01Z') }]);
    const result = await readFinanceV2CloseSources(f.tx, input);
    expect(result.complete).toBe(true); expect(result.sourceCount).toBe(1);
    expect(result.sourceRefs).toEqual([{ type: 'BUDGET', id: 'budget-a', version: '3' }]);
    expect(result.payload).toHaveProperty('BUDGET', [{ approvedMinor: 9007199254740991, createdAt: '2026-09-01T00:00:00.000Z', id: 'budget-a', version: 3 }]);
    expect(f.calls).toHaveLength(32);
    expect(f.calls.every(call => call.sql.includes('"businessId"=$1') && call.params[0] === input.businessId)).toBe(true);
    expect(f.calls.slice(0,29).every(call=>call.params[1]===input.asOf)).toBe(true);
    expect(f.calls.slice(30).every(call=>call.sql.includes('b.currency')&&call.sql.includes('JOIN "Business" b ON b.id=a."businessId"'))).toBe(true);
  });
  it('does not change token merely because request cut time changes', async () => {
    const f = fixture([{ id: 'budget-a', version: 3 }]);
    const one = await readFinanceV2CloseSources(f.tx, input);
    const two = await readFinanceV2CloseSources(f.tx, { ...input, asOf: '2026-10-05T10:01:00.000Z' });
    expect(one.token).toBe(two.token);
    const changed = await readFinanceV2CloseSources(fixture([{ id: 'budget-a', version: 4 }]).tx, input);
    expect(changed.token).not.toBe(one.token);
  });
  it('normalizes explicit offsets before querying UTC timestamp columns',async()=>{
    const f=fixture([{id:'budget-a',version:1}]);
    const utc=await readFinanceV2CloseSources(f.tx,input);
    const offset=await readFinanceV2CloseSources(f.tx,{...input,asOf:'2026-10-05T13:00:00+03:00'});
    expect(offset.token).toBe(utc.token);
    expect(f.calls.slice(32,61).every(call=>call.params[1]===input.asOf)).toBe(true);
  });
  it.each([[{ id: 'a', amountMinor: 9007199254740992n }], [{ id: 'a', version: 0 }], [{ id: 'a', result: { csv: 'private' } }]])('rejects unsafe/incomplete evidence before returning complete', async row => {
    await expect(readFinanceV2CloseSources(fixture([row]).tx, input)).rejects.toThrow();
  });
  it('fails on 5001 sources and returns no truncated snapshot', async () => {
    await expect(readFinanceV2CloseSources(fixture(Array.from({ length: 5001 }, (_, id) => ({ id: String(id) }))).tx, input)).rejects.toThrow('SOURCE_LIMIT');
  });
  it('protects September planning/cost inputs while October remains available',async()=>{
    const data:Record<string,Record<string,unknown>[]>= {
      FinanceBudget:[{id:'sept',version:3,periodMonth:'2026-09'},{id:'oct',version:1,periodMonth:'2026-10'}],
      FinanceBudgetRevision:[{id:'sept-rev',revisionNo:1,budgetId:'sept'},{id:'oct-rev',revisionNo:1,budgetId:'oct'}],
      FinanceCostAllocation:[{id:'alloc',revisionNo:1,consumedOn:new Date('2026-09-15Z'),ruleRevisionId:'rule-rev'}],
      FinanceAllocationRule:[{id:'mutable-rule-head',version:2}],
      FinanceAllocationRuleRevision:[{id:'rule-rev',revisionNo:1,ruleId:'mutable-rule-head'}],
      FinanceLaborCost:[{id:'labor-oct',version:1,consumedOn:new Date('2026-10-01Z')}],
      FinanceCommitment:[{id:'commit-sept',version:1,expectedConsumptionOn:new Date('2026-09-16Z')},{id:'commit-oct',version:1,expectedConsumptionOn:new Date('2026-10-16Z')}],
    };
    const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('READ_ONLY')),query:<T extends object>(sql:string)=>{const name=/FROM "([^"]+)"/.exec(sql)?.[1]??'';return Promise.resolve((data[name]??[])as T[]);}};
    const result=await readFinanceV2CloseSources(tx,input);
    expect(result.sourceRefs.some(ref=>ref.id==='oct')).toBe(true);
    expect(result.guardSourceRefs.map(ref=>ref.id)).toEqual(expect.arrayContaining(['sept','sept-rev','alloc','rule-rev','commit-sept']));
    expect(result.guardSourceRefs.some(ref=>['oct','oct-rev','mutable-rule-head','labor-oct','commit-oct'].includes(ref.id))).toBe(false);
  });
});
