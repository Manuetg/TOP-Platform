import { FinanceCsvPreviewError } from '../application/finance-v2-csv-preview.error';
import type { ImportSnapshot } from '../application/finance-v2-import.types';
import type { BankStatementSnapshot } from '../application/finance-v2-bank.types';
import { HISTORY_CSV_HEADER } from '../application/finance-v2-import.parser';
import { FinanceForbiddenError } from '../domain/finance.errors';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceImportBankSnapshotReader } from './finance-v2-import-bank.ports';
import { FinanceV2EvidenceReadService } from './finance-v2-evidence.read-service';

const businessId='11111111-1111-4111-8111-111111111111',actorUserId='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333';
const actor={businessId,actorUserId};
function fixture(role='OWNER'){
  const calls:string[]=[];
  const tx:FinanceSqlTransaction={query<T extends object>():Promise<T[]>{return Promise.resolve([{status:'ACTIVE',role,currency:'PYG',timeZone:'UTC'}]as unknown as T[]);},execute(){return Promise.reject(new Error('READ_ONLY'));}};
  const history:ImportSnapshot={businessId,timeZone:'UTC',now:'2026-10-05T12:00:00Z',policy:{enabled:false,version:0},accounts:[],catalogs:[],resources:[],bookings:[],expenses:[],importedItems:[]};
  const statement:BankStatementSnapshot={businessId,timeZone:'UTC',account:{id:accountId,businessId,kind:'BANK',currency:'PYG',version:1,archived:false,opening:{id:'opening',occurredAt:'2026-10-01T00:00:00Z',amountMinor:0}},existingRows:[]};
  const reader:FinanceImportBankSnapshotReader={history(){calls.push('history');return Promise.resolve(history);},statement(){calls.push('statement');return Promise.resolve(statement);},match(){return Promise.reject(new Error('UNUSED'));}};
  return{calls,service:new FinanceV2EvidenceReadService({read:work=>work(tx)},reader)};
}
describe('Concrete CSV preview reader preserves per-row failures (unit snapshot; no DB)',()=>{
  it('returns both bank row ordinals with money/date errors and null preview token',async()=>{
    const f=fixture(),csv='externalKey,bookedOn,amountMinor,reference\nrow-a,2026-10-01,1.5,private reference\nrow-b,2026-02-30,100,private reference';
    const result=await f.service.bankStatementPreview(actor,{accountId,expectedAccountVersion:1,sourceNamespace:'qa',csv}).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(FinanceCsvPreviewError);const error=result as FinanceCsvPreviewError;
    expect(error.issues.map(issue=>({ordinal:issue.ordinal,column:issue.column,code:issue.code}))).toEqual([{ordinal:2,column:'amountMinor',code:'INVALID_INPUT'},{ordinal:3,column:'bookedOn',code:'INVALID_INPUT'}]);expect(error.previewToken).toBeNull();expect(JSON.stringify(error.issues)).not.toContain('private reference');expect(f.calls).toEqual(['statement']);
  });
  it('preserves the actual history parser rowKind errors on separate rows',async()=>{
    const f=fixture(),row=(kind:string)=>HISTORY_CSV_HEADER.map(column=>column==='rowKind'?kind:column==='rowKey'?'own-key':'').join(','),csv=[HISTORY_CSV_HEADER.join(','),row('BOGUS'),row('UNSUPPORTED')].join('\n');
    const result=await f.service.importPreview(actor,{sourceNamespace:'qa',csv}).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(FinanceCsvPreviewError);expect((result as FinanceCsvPreviewError).issues).toEqual([{ordinal:2,column:'rowKind',code:'INVALID_INPUT',message:'ROW_KIND_INVALID: rowKind'},{ordinal:3,column:'rowKind',code:'INVALID_INPUT',message:'ROW_KIND_INVALID: rowKind'}]);
  });
  it('retains a header/global error at ordinal zero instead of inventing a valid preview',async()=>{
    const f=fixture(),result=await f.service.importPreview(actor,{sourceNamespace:'qa',csv:'not,the,header\na,b,c'}).catch((error:unknown)=>error);
    expect(result).toBeInstanceOf(FinanceCsvPreviewError);expect((result as FinanceCsvPreviewError).issues[0].ordinal).toBe(0);expect((result as FinanceCsvPreviewError).previewToken).toBeNull();
  });
  it('denies a Viewer before loading any tenant snapshot or parser result',async()=>{
    const f=fixture('VIEWER');await expect(f.service.importPreview(actor,{sourceNamespace:'qa',csv:'invalid'})).rejects.toBeInstanceOf(FinanceForbiddenError);expect(f.calls).toEqual([]);
  });
});
