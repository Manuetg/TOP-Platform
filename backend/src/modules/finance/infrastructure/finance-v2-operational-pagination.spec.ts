import { FinanceV2OperationalReadService,financeV2Cursor } from './finance-v2-operational.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceV2Page } from '../domain/finance-v2.types';

const BIZ='00000000-0000-0000-0000-000000000001';
const ACTOR='00000000-0000-0000-0000-000000000002';
const ids=[3,2,1].map(value=>`00000000-0000-0000-0000-${String(value).padStart(12,'0')}`);
const sameTimestamp=new Date('2026-10-05T10:00:00.123Z');
const methods=['drafts','templates','commitments','allocationRules','laborCosts']as const;

describe('operational UUID keyset pagination',()=>{
  it.each(methods)('%s returns every ID once when timestamps are identical',async method=>{
    const calls:{sql:string;parameters:readonly unknown[]}[]=[];
    const rows=ids.map(id=>({id,businessId:BIZ,createdAt:sameTimestamp,version:1,definitionVersion:1,state:'ACTIVE',description:'Source',amountMinor:100n,consumedOn:new Date('2026-10-05Z'),expectedConsumptionOn:new Date('2026-10-05Z'),dueOn:null,categoryId:null,resourceId:null,reference:null,operational:true,name:'Source',archived:false,label:'Source',personLabel:null,periodMonth:'2026-10',kind:'PRECOMPUTED_LABOR'}));
    const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('READ_ONLY')),query:<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>=>{
      calls.push({sql,parameters});
      if(sql.includes('FROM "User"'))return Promise.resolve([{status:'ACTIVE',role:'OWNER',currency:'PYG',timeZone:'UTC'}]as unknown as T[]);
      if(sql.includes('LIMIT $3')){
        expect(sql).toContain('($2::text IS NULL OR id<$2::text) ORDER BY id DESC');
        const cursor=parameters[1]as string|null;const limit=parameters[2]as number;
        return Promise.resolve(rows.filter(row=>cursor===null||row.id<cursor).slice(0,limit)as unknown as T[]);
      }
      if(sql.includes('AND id=$2'))return Promise.resolve(rows.filter(row=>row.id===parameters[1])as unknown as T[]);
      return Promise.resolve<T[]>([]);
    }};
    const service=new FinanceV2OperationalReadService({read:work=>work(tx)},{read:()=>Promise.resolve(null)});
    let cursor:string|null=null;const received:string[]=[];
    for(let page=0;page<3;page++){
      const result:FinanceV2Page<{id:string}>=await service[method]({businessId:BIZ,actorUserId:ACTOR},{cursor,limit:1});
      received.push(...result.items.map(row=>row.id));cursor=result.nextCursor;
    }
    expect(received).toEqual(ids);expect(new Set(received).size).toBe(3);expect(cursor).toBeNull();
    expect(calls.filter(call=>call.sql.includes('LIMIT $3')).map(call=>call.parameters[1])).toEqual([null,ids[0],ids[1]]);
  });

  it('rejects legacy timestamp or foreign-format cursor before fetching a page',()=>{
    expect(()=>financeV2Cursor({cursor:Buffer.from(JSON.stringify({createdAt:sameTimestamp.toISOString(),id:ids[0]})).toString('base64url'),limit:1})).toThrow();
    expect(financeV2Cursor({cursor:ids[0],limit:1})).toEqual({id:ids[0]});
  });
});
