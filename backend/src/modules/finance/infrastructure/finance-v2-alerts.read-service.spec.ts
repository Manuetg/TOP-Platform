import { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';

describe('Finance alerts read cut uses explicit UTC instant',()=>{
  it('queries offset-equivalent cuts with identical timestamp parameters and tokens',async()=>{
    const calls:{sql:string;parameters:readonly unknown[]}[]=[];
    const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('READ_ONLY')),query:<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>=>{
      calls.push({sql,parameters});
      return Promise.resolve((sql.includes('FROM "User"')?[{status:'ACTIVE',role:'OWNER',currency:'PYG',timeZone:'UTC'}]:[])as T[]);
    }};
    const service=new FinanceV2AlertsReadService({read:work=>work(tx)},{pending:()=>Promise.resolve({items:[],token:'service-cut'})});
    const actor={businessId:'00000000-0000-0000-0000-000000000001',actorUserId:'00000000-0000-0000-0000-000000000002'};
    const query={from:'2026-10-01',to:'2026-11-01',asOf:'2026-10-05T12:00:00.000Z'};
    const utc=await service.read(actor,query);
    const offset=await service.read(actor,{...query,asOf:'2026-10-05T15:00:00+03:00'});
    const counts=calls.filter(call=>call.sql.includes('FROM "FinanceCashCount"'));
    expect(counts).toHaveLength(2);
    expect(counts.every(call=>call.parameters[1]===query.asOf)).toBe(true);
    expect(offset.token).toBe(utc.token);
    expect(offset.items).toEqual(utc.items);
  });
});
