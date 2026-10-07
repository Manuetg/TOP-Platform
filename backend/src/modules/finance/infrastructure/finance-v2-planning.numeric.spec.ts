import { FinanceV2PlanningReadService,type FinancePlanningPublicReaders } from './finance-v2-planning.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';

const actor={businessId:'11111111-1111-4111-8111-111111111111',actorUserId:'22222222-2222-4222-8222-222222222222'};
const input={asOf:'2026-10-05T12:00:00Z',horizonTo:'2026-11-01',baseToken:'',accountIds:['33333333-3333-4333-8333-333333333333'],events:[],excludedSourceKeys:[]};
function fixture(paid='30000',consumed='20001',amountMinor=100001n){
  const queries:string[]=[];
  const tx:FinanceSqlTransaction={query<T extends object>(sql:string):Promise<T[]>{
    queries.push(sql);let result:object[];
    if(sql.includes('FROM "User"'))result=[{status:'ACTIVE',role:'OWNER',currency:'PYG',timeZone:'UTC'}];
    else if(sql.startsWith('SELECT ('))result=[{stale:false}];
    else if(sql.includes('FROM "FinanceExpense"'))result=[{id:'expense',amountMinor,paid,dueOn:null,version:1}];
    else if(sql.includes('FROM "FinanceCommitment"'))result=[{id:'commitment',amountMinor:80001n,consumed,dueOn:null,version:1}];
    else throw new Error('Unexpected query');return Promise.resolve(result as T[]);
  },execute(){return Promise.reject(new Error('READ_ONLY'));}};
  const readers:FinancePlanningPublicReaders={receivables:()=>Promise.resolve({rows:[],credits:[],reviewBookingIds:[],token:'receivables'}),cash:()=>Promise.resolve({balanceMinor:1000000,unknownAccountIds:[],token:'cash'})};
  return{queries,service:new FinanceV2PlanningReadService({read:work=>work(tx)},readers)};
}
describe('PostgreSQL numeric SUM text through current actual planning producer (unit; no DB)',()=>{
  it('converts PostgreSQL text SUM before bigint arithmetic in obligations and source catalog',async()=>{
    const f=fixture(),result=await f.service.planningPreview(actor,input);
    expect(result.sources.map(source=>({sourceKey:source.sourceKey,amountMinor:source.amountMinor}))).toEqual([{sourceKey:'EXPENSE:expense',amountMinor:70001},{sourceKey:'COMMITMENT:commitment',amountMinor:60000}]);expect(result.registeredBalanceMinor).toBe(1000000);expect(result.events).toEqual([]);
    expect(f.queries.find(sql=>sql.includes(' AS paid '))).toContain('::text AS paid');expect(f.queries.find(sql=>sql.includes(' AS consumed '))).toContain('::text AS consumed');
  });
  it('omits fully settled and fully consumed sources without fabricating zero obligations',async()=>{const f=fixture('100001','80001');expect((await f.service.planningPreview(actor,input)).sources).toEqual([]);});
  it('rejects overpaid PostgreSQL string SUM as a Finance conflict',async()=>{const f=fixture('100002');await expect(f.service.aging(actor,input.asOf)).rejects.toBeInstanceOf(FinanceConflictError);});
  it('rejects overconsumed PostgreSQL string SUM as a Finance conflict',async()=>{const f=fixture('0','80002');await expect(f.service.planningPreview(actor,input)).rejects.toBeInstanceOf(FinanceConflictError);});
  it('rejects an outstanding amount outside safe PYG integers rather than rounding the raw aggregate',async()=>{const f=fixture('0','0',9007199254740992n);await expect(f.service.aging(actor,input.asOf)).rejects.toBeInstanceOf(FinanceInputError);});
});
