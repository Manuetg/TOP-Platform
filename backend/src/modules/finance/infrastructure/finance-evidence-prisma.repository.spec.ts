import { FinanceEvidencePrismaRepository } from './finance-evidence-prisma.repository';
import { FinanceEvidenceUseCases } from '../application/finance-evidence.use-cases';
import type { FinanceEvidenceCapabilities, FinanceEvidenceSqlTransaction, FinanceEvidenceTransactionHost } from './finance-evidence-access';
import type { FinanceEvidenceStoragePort, FinanceEvidenceUpload } from '../domain/finance-evidence-storage.port';
import type { FinanceEvidenceMetadataDto, FinanceEvidenceUploadResult } from '../domain/finance-evidence.types';
import { FinancialFileIntegrityError, FinancialFileUnavailableError } from '../domain/finance-evidence-file.rules';

const BIZ='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const EXPENSE='33333333-3333-4333-8333-333333333333';
const FOREIGN='44444444-4444-4444-8444-444444444444';
const actor={businessId:BIZ,actorUserId:USER};
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n');
const file={filename:'proof.pdf',mimeType:'application/pdf',bytes:pdf};
const key='file-idempotency-0001';
type StoredFile=Omit<FinanceEvidenceMetadataDto,'createdAt'>&{createdAt:Date;storageKey:string;requestId:string};
interface State { expense:{businessId:string;version:number;amountMinor:bigint;consumedOn:string;reference:null}; requests:Map<string,{id:string;fingerprint:string;result:FinanceEvidenceUploadResult}>; files:Map<string,StoredFile>; audits:unknown[] }

class MemoryHost implements FinanceEvidenceTransactionHost,FinanceEvidenceSqlTransaction {
  state:State={expense:{businessId:BIZ,version:1,amountMinor:150000n,consumedOn:'2026-09-15',reference:null},requests:new Map(),files:new Map(),audits:[]};
  userStatus='ACTIVE';role='OWNER';businessStatus='ACTIVE';failAudit=false;failCas=false;fileTimestampOffsetMs=0;
  commitMode:'OK'|'UNKNOWN_PERSIST'|'UNKNOWN_ROLLBACK'='OK';
  calls:{sql:string;parameters:readonly unknown[]}[]=[];
  private serial:Promise<unknown>=Promise.resolve();
  read<T>(work:(tx:FinanceEvidenceSqlTransaction)=>Promise<T>):Promise<T>{return work(this);}
  transaction<T>(work:(tx:FinanceEvidenceSqlTransaction)=>Promise<T>):Promise<T>{
    const run=this.serial.then(()=>this.runTransaction(work));this.serial=run.then(()=>undefined,()=>undefined);return run;
  }
  private async runTransaction<T>(work:(tx:FinanceEvidenceSqlTransaction)=>Promise<T>):Promise<T>{
    const before=structuredClone(this.state);let completed=false;
    try{const result=await work(this);completed=true;if(this.commitMode!=='OK')throw new Error('COMMIT_CONNECTION_LOST');return result;}
    catch(error){if(!completed||this.commitMode==='UNKNOWN_ROLLBACK')this.state=before;throw error;}
  }
  query<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>{
    this.calls.push({sql,parameters});return Promise.resolve(this.queryRows(sql,parameters)as T[]);
  }
  private queryRows(sql:string,parameters:readonly unknown[]):object[]{
    if(sql.includes('AS "recordedAt"'))return[{recordedAt:new Date('2026-10-05T12:00:00.123Z')}];
    if(sql.includes('FROM "User"'))return[{status:this.userStatus}];
    if(sql.includes('FROM "UserBusinessMembership"'))return[{role:this.role}];
    if(sql.includes('FROM "Business"'))return[{status:this.businessStatus,currency:'PYG'}];
    if(sql.includes('FROM "FinanceExpense"'))return parameters[0]===this.state.expense.businessId&&parameters[1]===EXPENSE?[this.state.expense]:[];
    return this.queryFinancialRows(sql,parameters);
  }
  private queryFinancialRows(sql:string,parameters:readonly unknown[]):object[]{
    if(sql.includes('FROM "FinanceRequest"')){const row=this.state.requests.get(`${String(parameters[0])}:${String(parameters[2])}`);return row?[row]:[];}
    if(sql.startsWith('INSERT INTO "FinanceEvidenceFile"'))return[this.insertFile(parameters)];
    if(sql.includes('FROM "FinanceEvidenceFile"'))return this.selectFiles(sql,parameters);
    throw new Error(`Unexpected query ${sql}`);
  }
  private insertFile(parameters:readonly unknown[]):StoredFile{
    const[id,businessId,expenseId,requestId,recordedByUserId,expenseVersion,filename,mimeType,sizeBytes,sha256,storageKey]=parameters;
    const row={id,businessId,expenseId,requestId,recordedByUserId,expenseVersion,filename,mimeType,sizeBytes,sha256,storageKey,createdAt:new Date(Date.parse(parameters[11]as string)+this.fileTimestampOffsetMs)}as StoredFile;
    if(![...this.state.requests.values()].some(request=>request.id===requestId))throw new Error('FK_REQUEST_MISSING');this.state.files.set(row.id,row);return row;
  }
  private selectFiles(sql:string,parameters:readonly unknown[]):StoredFile[]{
    const selected=[...this.state.files.values()].filter(row=>row.businessId===parameters[0]);
    if(sql.includes('JOIN "FinanceExpense"'))return selected.filter(row=>row.id===parameters[1]&&this.state.expense.businessId===row.businessId&&[...this.state.requests.values()].some(request=>request.id===row.requestId));
    if(sql.includes('f."expenseId"=$2'))return selected.filter(row=>row.expenseId===parameters[1]);return selected;
  }
  execute(sql:string,parameters:readonly unknown[]):Promise<number>{
    this.calls.push({sql,parameters});return Promise.resolve(this.executeMutation(sql,parameters));
  }
  private executeMutation(sql:string,parameters:readonly unknown[]):number{
    if(sql.startsWith('UPDATE "FinanceExpense"')){
      if(this.failCas||parameters[0]!==BIZ||parameters[1]!==EXPENSE||parameters[2]!==this.state.expense.version)return 0;
      this.state.expense.version++;return 1;
    }
    return this.executeRequestOrAudit(sql,parameters);
  }
  private executeRequestOrAudit(sql:string,parameters:readonly unknown[]):number{
    if(sql.startsWith('INSERT INTO "FinanceRequest"')){this.state.requests.set(`${String(parameters[1])}:${String(parameters[3])}`,{id:parameters[0]as string,fingerprint:parameters[4]as string,result:JSON.parse(parameters[5]as string)as FinanceEvidenceUploadResult});return 1;}
    if(sql.startsWith('UPDATE "FinanceRequest"'))throw new Error('FINANCE_HISTORY_IMMUTABLE');
    if(sql.startsWith('INSERT INTO "FinanceAudit"')){if(this.failAudit)throw new Error('AUDIT_FAILED');this.state.audits.push(JSON.parse(parameters[5]as string)as unknown);return 1;}
    throw new Error(`Unexpected execute ${sql}`);
  }
}
class MemoryStorage implements FinanceEvidenceStoragePort {
  enabled=true;objects=new Map<string,Buffer>();uploads:string[]=[];downloads:string[]=[];deletes:string[]=[];
  upload(input:FinanceEvidenceUpload):Promise<void>{this.uploads.push(input.key);this.objects.set(input.key,Buffer.from(input.bytes));return Promise.resolve();}
  download(key:string):Promise<Buffer>{this.downloads.push(key);const bytes=this.objects.get(key);if(!bytes)return Promise.reject(new FinancialFileUnavailableError('MISSING_OBJECT'));return Promise.resolve(Buffer.from(bytes));}
  deleteOwned(key:string):Promise<void>{this.deletes.push(key);this.objects.delete(key);return Promise.resolve();}
}
function fixture(){
  const host=new MemoryHost();const storage=new MemoryStorage();const grants=new Set(['finance.evidence.read','finance.evidence.write']);
  const capabilities:FinanceEvidenceCapabilities={allows:(role,operation)=>role==='OWNER'&&grants.has(`finance.evidence.${operation.toLowerCase()}`)};
  const repository=new FinanceEvidencePrismaRepository(host,storage,capabilities);const service=new FinanceEvidenceUseCases(repository);
  return{host,storage,grants,repository,service};
}
function upload(f:ReturnType<typeof fixture>,idempotencyKey=key,expectedVersion='1'){return f.service.upload(actor,EXPENSE,{expectedVersion},idempotencyKey,file);}

describe('Finance evidence atomic repository (SQL transaction fixture; no DB/S3)',()=>{
  it('locks current membership/Business before upload and atomically stores file/CAS/audit/request without money changes',async()=>{
    const f=fixture();const before={...f.host.state.expense};const result=await upload(f);
    expect(result.version).toBe(2);expect(result.file).not.toHaveProperty('storageKey');expect(result.file).not.toHaveProperty('url');
    expect(f.host.state.expense).toEqual({...before,version:2});expect(f.host.state.files.size).toBe(1);expect(f.host.state.requests.size).toBe(1);expect(f.host.state.audits).toHaveLength(1);
    expect(f.host.calls.slice(0,3).map(call=>call.sql)).toEqual(['SELECT status FROM "User" WHERE id=$1 FOR SHARE','SELECT role FROM "UserBusinessMembership" WHERE "userId"=$1 AND "businessId"=$2 FOR SHARE','SELECT status,currency FROM "Business" WHERE id=$1 FOR UPDATE']);
    expect(f.host.calls.some(call=>call.sql.includes('UPDATE "FinanceExpense" SET version=version+1'))).toBe(true);
    expect(f.storage.uploads).toHaveLength(1);expect(f.storage.deletes).toHaveLength(0);
    expect(f.host.calls.filter(call=>call.sql.includes('AS "recordedAt"'))).toHaveLength(1);expect(result.file.createdAt).toBe('2026-10-05T12:00:00.123Z');
    expect([...f.host.state.requests.values()][0].result).toEqual(result);expect(f.host.calls.some(call=>call.sql.startsWith('UPDATE "FinanceRequest"'))).toBe(false);
    expect(f.host.calls.find(call=>call.sql.startsWith('INSERT INTO "FinanceRequest"'))?.parameters[6]).toBe(result.file.createdAt);
    expect(f.host.calls.find(call=>call.sql.startsWith('INSERT INTO "FinanceEvidenceFile"'))?.parameters[11]).toBe(result.file.createdAt);
  });
  it('replays before old expected-version checks with no second object or fact',async()=>{
    const f=fixture();const first=await upload(f);f.storage.enabled=false;f.host.businessStatus='ARCHIVED';const replay=await upload(f);
    expect(replay).toEqual(first);expect(f.storage.uploads).toHaveLength(1);expect(f.host.state.expense.version).toBe(2);
  });
  it('same idempotency key with changed bytes/version/filename is another intent',async()=>{
    const f=fixture();await upload(f);
    await expect(f.service.upload(actor,EXPENSE,{expectedVersion:'1'},key,{...file,filename:'other.pdf'})).rejects.toThrow('otro');
    await expect(upload(f,key,'2')).rejects.toThrow('otro');expect(f.storage.uploads).toHaveLength(1);
  });
  it.each(['ADMIN','RECEPTIONIST','VIEWER'])('denies current %s before replay or storage',async role=>{
    const f=fixture();await upload(f);f.host.role=role;
    await expect(upload(f)).rejects.toThrow('no autorizado');await expect(f.service.download(actor,[...f.host.state.files.keys()][0])).rejects.toThrow('no autorizado');expect(f.storage.downloads).toHaveLength(0);
  });
  it('revoked user and legacy-only Finance/Payment capabilities cannot replay or read evidence',async()=>{
    const f=fixture();const result=await upload(f);f.host.userStatus='DISABLED';await expect(upload(f)).rejects.toThrow('no autorizado');
    f.host.userStatus='ACTIVE';f.grants.clear();f.grants.add('finance.write');f.grants.add('payment.record');
    await expect(upload(f)).rejects.toThrow('no autorizado');await expect(f.service.download(actor,result.id)).rejects.toThrow('no autorizado');expect(f.storage.downloads).toHaveLength(0);
  });
  it('hides foreign expense/file before touching object storage',async()=>{
    const f=fixture();const first=await upload(f);
    await expect(f.service.upload({...actor,businessId:FOREIGN},EXPENSE,{expectedVersion:'1'},'foreign-file-0001',file)).rejects.toThrow('no disponible');
    await expect(f.service.download({...actor,businessId:FOREIGN},first.id)).rejects.toThrow('no disponible');expect(f.storage.uploads).toHaveLength(1);expect(f.storage.downloads).toHaveLength(0);
  });
  it('disabled storage exposes disabled metadata and rejects new uploads without a partial fact',async()=>{
    const f=fixture();f.storage.enabled=false;expect((await f.service.list(actor,EXPENSE)).enabled).toBe(false);
    await expect(upload(f)).rejects.toBeInstanceOf(FinancialFileUnavailableError);expect(f.storage.uploads).toHaveLength(0);expect(f.host.state.expense.version).toBe(1);
  });
  it('concurrent different intents with the same Expense CAS yield one fact/object',async()=>{
    const f=fixture();const result=await Promise.allSettled([upload(f,'concurrent-file-01'),upload(f,'concurrent-file-02')]);
    expect(result.filter(row=>row.status==='fulfilled')).toHaveLength(1);expect(result.filter(row=>row.status==='rejected')).toHaveLength(1);
    expect(f.host.state.files.size).toBe(1);expect(f.storage.uploads).toHaveLength(1);
  });
  it('known callback rollback compensates only its new object and rolls back all facts',async()=>{
    const f=fixture();f.host.failAudit=true;await expect(upload(f)).rejects.toThrow('AUDIT_FAILED');
    expect(f.storage.deletes).toEqual(f.storage.uploads);expect(f.storage.objects.size).toBe(0);expect(f.host.state.expense.version).toBe(1);expect(f.host.state.files.size).toBe(0);expect(f.host.state.requests.size).toBe(0);
  });
  it('rejects metadata timestamp mismatch and rolls back Request/File/CAS while deleting only its new object',async()=>{
    const f=fixture();f.host.fileTimestampOffsetMs=1;await expect(upload(f)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
    expect(f.host.state.requests.size).toBe(0);expect(f.host.state.files.size).toBe(0);expect(f.host.state.expense.version).toBe(1);expect(f.storage.deletes).toEqual(f.storage.uploads);
  });
  it.each(['UNKNOWN_PERSIST','UNKNOWN_ROLLBACK']as const)('preserves object on %s and retry discovers the authoritative DB state',async mode=>{
    const f=fixture();f.host.commitMode=mode;await expect(upload(f)).rejects.toThrow('COMMIT_CONNECTION_LOST');const preserved=f.storage.uploads[0];expect(f.storage.objects.has(preserved)).toBe(true);expect(f.storage.deletes).toHaveLength(0);
    f.host.commitMode='OK';await upload(f);expect(f.host.state.files.size).toBe(1);expect(f.storage.uploads).toHaveLength(mode==='UNKNOWN_PERSIST'?1:2);expect(f.storage.objects.has(preserved)).toBe(true);
  });
  it('serves authenticated bytes only after DB hash/key integrity checks',async()=>{
    const f=fixture();const result=await upload(f);expect((await f.service.download(actor,result.id)).bytes).toEqual(pdf);
    const row=f.host.state.files.get(result.id)!;row.storageKey=row.storageKey.replace(BIZ,FOREIGN);await expect(f.service.download(actor,result.id)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
    expect(f.storage.downloads).toHaveLength(1);
  });
  it('restored DB+object copies verify IDs/links/hash/auth and fail when the copy is damaged',async()=>{
    const origin=fixture();const result=await upload(origin);const restored=fixture();restored.host.state=structuredClone(origin.host.state);restored.storage.objects=new Map([...origin.storage.objects].map(([key,bytes])=>[key,Buffer.from(bytes)]));
    expect(await restored.repository.verifyRestoredFiles(actor)).toEqual({verifiedFileIds:[result.id],hashes:[{id:result.id,sha256:result.file.sha256}]});
    const storageKey=restored.host.state.files.get(result.id)!.storageKey;restored.storage.objects.set(storageKey,Buffer.from('corrupt'));
    await expect(restored.repository.verifyRestoredFiles(actor)).rejects.toBeInstanceOf(FinancialFileIntegrityError);expect(origin.storage.objects.get(storageKey)).toEqual(pdf);
    restored.host.role='VIEWER';await expect(restored.repository.verifyRestoredFiles(actor)).rejects.toThrow('no autorizado');
  });
});
