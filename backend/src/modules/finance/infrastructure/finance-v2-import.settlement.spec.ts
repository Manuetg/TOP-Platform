import { FinanceImportBankSqlAtomicWriter } from './finance-v2-import-bank.atomic-writer';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceV2Mutation } from '../domain/finance-v2.types';
import type { HistorySettlement } from '../application/finance-v2-import.types';
import { FinanceInputError } from '../domain/finance.errors';

const businessId='11111111-1111-4111-8111-111111111111',actorUserId='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333',expenseId='44444444-4444-4444-8444-444444444444';
const input:FinanceV2Mutation={businessId,actorUserId,idempotencyKey:'history-regression-0001',fingerprint:'b'.repeat(64),command:{type:'CONFIRM_HISTORY_IMPORT',sourceNamespace:'own-history',csv:'synthetic CSV',previewToken:'a'.repeat(64),reason:'Explicit own historical facts'}};
const source:HistorySettlement={kind:'SETTLEMENT',externalKey:'own-settlement',rowKeys:['row-own-settlement'],accountId,expenseId:null,expenseDocumentKey:'own-imported-doc',amountMinor:300000,occurredAt:'2026-09-25T12:00:00Z',reference:'Own historical proof',includedInOpening:true};
function fixture(){
  const writes:{sql:string;parameters:readonly unknown[]}[]=[];
  const tx:FinanceSqlTransaction={query<T extends object>(sql:string):Promise<T[]>{
    let result:object[];
    if(sql.startsWith('SELECT version'))result=[{version:1}];
    else if(sql.includes('SELECT "amountMinor",version'))result=[{amountMinor:900000n,version:1}];
    else if(sql.includes('SUM("amountMinor")'))result=[{paid:'0'}];
    else if(sql.includes('FROM "FinanceAccount"'))result=[{archived:false,occurredAt:new Date('2026-10-01T00:00:00Z')}];
    else throw new Error('Unexpected query');return Promise.resolve(result as T[]);
  },execute(sql,parameters){writes.push({sql,parameters});return Promise.resolve(1);}};
  const writer=new FinanceImportBankSqlAtomicWriter({read:()=>Promise.reject(new Error('NO_BOOKING_SOURCE'))},{load:()=>Promise.reject(new Error('NO_BANK_SOURCE'))});
  return{writes,tx,writer};
}
describe('Concrete history writer projects the closed V1 settlement input (unit SQL; no DB)',()=>{
  it('accepts full CSV source metadata while passing only the four settlement fields to the closed parser',async()=>{
    const f=fixture(),result=await f.writer.settlement(f.tx,input,source,expenseId),settlements=f.writes.filter(call=>call.sql.startsWith('INSERT INTO "FinanceSettlement"'));
    expect(settlements).toHaveLength(1);expect(settlements[0].parameters.slice(1,8)).toEqual([businessId,expenseId,accountId,300000n,'2026-09-25T12:00:00.000Z','Own historical proof',actorUserId]);expect(result.id).toBe(settlements[0].parameters[0]);expect(f.writes.at(-1)?.parameters).toEqual([businessId,expenseId,1]);expect(f.writes.some(call=>call.sql.includes('INSERT INTO "FinanceExpense"'))).toBe(false);
  });
  it('keeps includedInOpening separate and rejects a pre-opening payment when that flag is absent',async()=>{
    const f=fixture();await expect(f.writer.settlement(f.tx,input,{...source,includedInOpening:false},expenseId)).rejects.toBeInstanceOf(FinanceInputError);expect(f.writes).toEqual([]);
  });
});
