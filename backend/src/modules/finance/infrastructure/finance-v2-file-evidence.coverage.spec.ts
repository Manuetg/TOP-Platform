import { readFinanceCostSources } from './finance-v2-cost.reader';
import { FinanceV2AlertsReadService } from './finance-v2-alerts.read-service';
import { deriveFinanceAlerts } from '../application/finance-v2-alerts.rules';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const businessId='11111111-1111-4111-8111-111111111111',actorUserId='22222222-2222-4222-8222-222222222222';
const input={businessId,from:'2026-09-01',to:'2026-10-01',asOf:'2026-10-05T15:00:00+03:00'};
const expense={id:'expense',version:2,description:'Actual own cost',outstandingMinor:100000,dueOn:null,reference:null};
function costTransaction(hasEvidenceFile:boolean,hasPostCutMutation=false):FinanceSqlTransaction&{calls:{sql:string;parameters:readonly unknown[]}[]}{
  const calls:{sql:string;parameters:readonly unknown[]}[]=[];
  return{calls,execute:()=>Promise.reject(new Error('NO_WRITES_OR_PROVIDER')),query<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>{
    calls.push({sql,parameters});const rows=sql.includes('FROM "FinanceExpenseLine"')?[{id:'line',amountMinor:100000n,operational:true,resourceId:null,expenseVersion:2,consumedOn:new Date('2026-09-30'),reference:null,hasEvidenceFile,hasPostCutMutation}]:[];return Promise.resolve(rows as T[]);
  }};
}
describe('Private file metadata evidence coverage; no financial mutation or S3 read',()=>{
  it('current file removes missing-cost coverage while preserving exact money and leaving reference null',async()=>{
    const known=await readFinanceCostSources(costTransaction(true),input),missing=await readFinanceCostSources(costTransaction(false),input);
    expect(known.costSources).toEqual(missing.costSources);expect(known.coverage.missingEvidenceSourceIds).toEqual([]);expect(missing.coverage.missingEvidenceSourceIds).toEqual(['EXPENSE_LINE:line']);expect(known.token).not.toBe(missing.token);
  });
  it('bounds file evidence by the normalized cut and both tenant and Expense keys; a foreign/future file cannot satisfy coverage',async()=>{
    const tx=costTransaction(false),result=await readFinanceCostSources(tx,input),sql=tx.calls[0].sql;
    expect(sql).toContain('f."businessId"=e."businessId" AND f."expenseId"=e.id AND f."createdAt"<=$4::timestamp');expect(tx.calls[0].parameters).toEqual([businessId,input.from,input.to,'2026-10-05T12:00:00.000Z']);expect(result.coverage.missingEvidenceSourceIds).toEqual(['EXPENSE_LINE:line']);
  });
  it('a later File audit/version keeps historical cost SOURCE_STALE rather than pretending to reconstruct an old Expense version',async()=>{
    await expect(readFinanceCostSources(costTransaction(false,true),input)).rejects.toMatchObject({code:'SOURCE_STALE'});
  });
  it('current file resolves only missing-evidence alert, with no fake reference or debt settlement',()=>{
    const missing=deriveFinanceAlerts('2026-10-05',{expenses:[{...expense,dueOn:'2026-09-30',hasEvidenceFile:false}],cashCounts:[],pendingService:[]});
    const known=deriveFinanceAlerts('2026-10-05',{expenses:[{...expense,dueOn:'2026-09-30',hasEvidenceFile:true}],cashCounts:[],pendingService:[]});
    expect(missing.map(row=>row.kind)).toEqual(['MISSING_EXPENSE_EVIDENCE','OVERDUE_PAYABLE']);expect(known.map(row=>row.kind)).toEqual(['OVERDUE_PAYABLE']);expect(known[0].amountMinor).toBe(100000);expect(expense.reference).toBeNull();
  });
  it('alerts reader obtains immutable file presence within the same tenant transaction and normalizes timestamp SQL',async()=>{
    const calls:{sql:string;parameters:readonly unknown[]}[]=[];
    const tx:FinanceSqlTransaction={execute:()=>Promise.reject(new Error('READ_ONLY')),query<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>{
      calls.push({sql,parameters});const rows=sql.includes('FROM "User"')?[{status:'ACTIVE',role:'OWNER',currency:'PYG',timeZone:'UTC'}]:sql.includes('FROM "FinanceExpense"')?[{...expense,amountMinor:100000n,paid:0n,hasEvidenceFile:true}]:[];return Promise.resolve(rows as T[]);
    }};
    const reader=new FinanceV2AlertsReadService({read:work=>work(tx)},{pending:()=>Promise.resolve({items:[],token:'service'})}),result=await reader.read({businessId,actorUserId},input);
    expect(result.items).toEqual([]);const query=calls.find(call=>call.sql.includes('FROM "FinanceExpense"'))!;expect(query.sql).toContain('f."businessId"=e."businessId" AND f."expenseId"=e.id AND f."createdAt"<=$2::timestamp');expect(query.parameters).toEqual([businessId,'2026-10-05T12:00:00.000Z']);
  });
});
