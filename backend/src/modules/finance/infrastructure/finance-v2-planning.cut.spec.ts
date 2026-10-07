import { FinanceV2PlanningReadService, type FinancePlanningPublicReaders } from './finance-v2-planning.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const businessId='11111111-1111-4111-8111-111111111111',actorUserId='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333';
const actor={businessId,actorUserId},input={asOf:'2026-10-05T15:00:00+03:00',horizonTo:'2026-11-01',baseToken:'',accountIds:[accountId],events:[],excludedSourceKeys:[]};
function fixture(staleRows:object[]=[{stale:false}],role='OWNER'){
  const calls:{sql:string;parameters:readonly unknown[]}[]=[],publicCuts:string[]=[];
  const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('NO_WRITES')),query<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>{
    calls.push({sql,parameters});const rows=sql.includes('FROM "User"')?[{status:'ACTIVE',role,currency:'PYG',timeZone:'America/Asuncion'}]:sql.includes('AS "stale"')?staleRows:[];return Promise.resolve(rows as T[]);
  }};
  const readers:FinancePlanningPublicReaders={receivables(current,_business,cut){expect(current).toBe(tx);publicCuts.push(cut);return Promise.resolve({rows:[],credits:[],reviewBookingIds:[],token:'receivables'});},cash(current,_business,cut){expect(current).toBe(tx);publicCuts.push(cut);return Promise.resolve({balanceMinor:1000000,unknownAccountIds:[],token:'cash'});}};
  return{calls,publicCuts,service:new FinanceV2PlanningReadService({read:work=>work(tx)},readers)};
}
describe('Planning cut integrity (unit SQL result fixtures, no database)',()=>{
  it.each([
    ['Expense created later','e."createdAt">$2::timestamp'],
    ['Settlement created/economically effective later','s."createdAt">$2::timestamp OR s."occurredAt">$2::timestamp'],
    ['Commitment created/cancelled later','c."createdAt">$2::timestamp OR c."cancelledAt">$2::timestamp'],
    ['Conversion created later or consuming a future date','x."createdAt">$2::timestamp OR e.id IS NULL OR e."consumedOn">$3::date'],
    ['A linked mutable-source audit after cut','a."occurredAt">$2::timestamp'],
  ])('rejects a stale %s before reading receivables, cash, or emitting sources',async(_reason,condition)=>{
    const f=fixture([{stale:true}]);await expect(f.service.planningPreview(actor,input)).rejects.toThrow('SOURCE_STALE');expect(f.publicCuts).toEqual([]);
    expect(f.calls.find(call=>call.sql.includes('AS "stale"'))?.sql).toContain(condition);
    await expect(f.service.aging(actor,input.asOf)).rejects.toThrow('SOURCE_STALE');expect(f.publicCuts).toEqual([]);
  });
  it.each([{reason:'missing',rows:[]},{reason:'missing scalar',rows:[{}]},{reason:'ambiguous',rows:[{stale:false},{stale:false}]}])('fails closed when the provenance guard result is $reason',async({rows})=>{
    const f=fixture(rows);await expect(f.service.planningPreview(actor,input)).rejects.toThrow('SOURCE_STALE');expect(f.publicCuts).toEqual([]);
  });
  it('normalizes explicit offsets for guard, receivables and canonical cash within the same transaction',async()=>{
    const f=fixture(),result=await f.service.planningPreview(actor,input);
    expect(result.asOf).toBe('2026-10-05T12:00:00.000Z');expect(f.publicCuts).toEqual([result.asOf,result.asOf]);expect(result.sources).toEqual([]);
    const guard=f.calls.find(call=>call.sql.includes('AS "stale"'));expect(guard?.parameters).toEqual([businessId,result.asOf,'2026-10-05']);
    const same=await f.service.planningPreview(actor,{...input,asOf:result.asOf});expect(same.token).toBe(result.token);
  });
  it('correlates every audit/source and conversion Expense by tenant rather than accepting a matching foreign ID',async()=>{
    const f=fixture();await f.service.aging(actor,input.asOf);const sql=f.calls.find(call=>call.sql.includes('AS "stale"'))?.sql;
    for(const alias of ['e','s','c','x'])expect(sql).toContain(`${alias}."businessId"=a."businessId" AND ${alias}.id=a."sourceId"`);
    expect(sql).toContain('e."businessId"=x."businessId" AND e.id=x."expenseId"');expect(sql).toContain('a."businessId"=$1');
  });
  it('rejects an ISO cut without offset before querying financial facts or public readers',async()=>{
    const f=fixture();await expect(f.service.aging(actor,'2026-10-05T12:00:00')).rejects.toThrow('offset');expect(f.publicCuts).toEqual([]);expect(f.calls).toHaveLength(1);
  });
  it('denies nonOwner before running the provenance guard',async()=>{
    const f=fixture([{stale:false}],'VIEWER');await expect(f.service.planningPreview(actor,input)).rejects.toThrow('autorizado');expect(f.publicCuts).toEqual([]);expect(f.calls).toHaveLength(1);
  });
});
