import { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const actor={businessId:'11111111-1111-4111-8111-111111111111',actorUserId:'22222222-2222-4222-8222-222222222222'},query={from:'2026-09-01',to:'2026-10-01',asOf:'2026-10-05T12:00:00Z'};
function fixture(paid:string){
  const queries:string[]=[];
  const tx:FinanceSqlTransaction={query<T extends object>(sql:string):Promise<T[]>{
    queries.push(sql);let result:object[];
    if(sql.includes('FROM "User"'))result=[{status:'ACTIVE',role:'OWNER',currency:'PYG',timeZone:'UTC'}];
    else if(sql.includes('FROM "FinanceExpense"'))result=[{id:'expense',version:1,description:'Actual own debt',amountMinor:100001n,paid,dueOn:new Date('2026-09-30'),reference:'owned proof',hasEvidenceFile:false}];
    else if(sql.includes('FROM "FinanceCashCount"'))result=[];
    else throw new Error('Unexpected query');return Promise.resolve(result as T[]);
  },execute(){return Promise.reject(new Error('READ_ONLY'));}};
  return{queries,service:new FinanceV2AlertsReadService({read:work=>work(tx)},{pending:()=>Promise.resolve({items:[],token:'coverage'})})};
}
describe('PostgreSQL numeric SUM text through current actual alerts producer (unit; no DB)',()=>{
  it('uses exact pending debt from a PostgreSQL string SUM',async()=>{const f=fixture('30000'),result=await f.service.read(actor,query);expect(result.items).toHaveLength(1);expect(result.items[0]).toMatchObject({kind:'OVERDUE_PAYABLE',amountMinor:70001});expect(f.queries.find(sql=>sql.includes(' AS paid '))).toContain('::text AS paid');});
  it('removes the overdue alert when the authoritative debt is fully settled',async()=>{const f=fixture('100001');expect((await f.service.read(actor,query)).items).toEqual([]);});
});
