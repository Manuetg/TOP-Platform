import { readFinanceEvidenceCloseSources } from './finance-evidence-close.reader';
import type { FinanceEvidenceSqlTransaction } from './finance-evidence-access';

const businessId='11111111-1111-4111-8111-111111111111';
const from='2026-09-01',to='2026-10-01';
const row={id:'22222222-2222-4222-8222-222222222222',businessId,expenseId:'33333333-3333-4333-8333-333333333333',expenseVersion:2,filename:'proof.pdf',mimeType:'application/pdf' as const,sizeBytes:64,sha256:'a'.repeat(64),recordedByUserId:'44444444-4444-4444-8444-444444444444',createdAt:new Date('2026-10-05T12:00:00Z')};
function transaction(rows:object[]):FinanceEvidenceSqlTransaction&{calls:{sql:string;parameters:readonly unknown[]}[]}{
  const calls:{sql:string;parameters:readonly unknown[]}[]=[];
  return {calls,query<T extends object>(sql:string,parameters:readonly unknown[]):Promise<T[]>{calls.push({sql,parameters});return Promise.resolve(rows as T[]);},execute(){return Promise.reject(new Error('CLOSE_METADATA_MUST_BE_READ_ONLY'));}};
}

describe('Evidence close metadata supplement',()=>{
  it('normalizes offsets before timestamp SQL and yields the same immutable metadata/refs',async()=>{
    const first=transaction([row]),second=transaction([row]);
    const a=await readFinanceEvidenceCloseSources(first,{businessId,from,to,asOf:'2026-10-05T15:00:00+03:00'});
    const b=await readFinanceEvidenceCloseSources(second,{businessId,from,to,asOf:'2026-10-05T12:00:00Z'});
    expect(a).toEqual(b);expect(first.calls[0]?.parameters).toEqual([businessId,from,to,'2026-10-05T12:00:00.000Z']);
    expect(first.calls[0]?.sql).toContain('f."createdAt"<=$4::timestamp');
    expect(first.calls[0]?.sql).toContain('e."consumedOn">=$2::date AND e."consumedOn"<$3::date');
    expect(first.calls[0]?.sql).toContain('e."businessId"=f."businessId"');
    expect(a.sourceRefs).toEqual([{type:'EVIDENCE_FILE',id:row.id,version:'2'}]);
    expect(a.guardSourceRefs).toEqual(a.sourceRefs);expect(a.complete).toBe(true);
    expect(JSON.stringify(a)).not.toMatch(/storageKey|bucket|https?:|requestId/);
  });
  it('returns an empty complete supplement when no file was recorded at the requested cut',async()=>{
    const tx=transaction([]);expect(await readFinanceEvidenceCloseSources(tx,{businessId,from,to,asOf:'2026-10-05T12:00:00Z'})).toEqual({payload:{EVIDENCE_FILE:[]},sourceRefs:[],guardSourceRefs:[],sourceCount:0,complete:true,missingSources:[]});
    expect(tx.calls).toHaveLength(1);
  });
  it('fails closed rather than truncating >5000 metadata records',async()=>{
    await expect(readFinanceEvidenceCloseSources(transaction(Array.from({length:5001},()=>row)),{businessId,from,to,asOf:'2026-10-05T12:00:00Z'})).rejects.toThrow('FINANCE_CLOSE_SOURCE_LIMIT_EXCEEDED');
  });
  it.each(['2026-10-05T12:00:00','2026-02-30T12:00:00Z','not-a-cut'])('rejects invalid cut %s before SQL',async asOf=>{
    const tx=transaction([]);await expect(readFinanceEvidenceCloseSources(tx,{businessId,from,to,asOf})).rejects.toThrow();expect(tx.calls).toHaveLength(0);
  });
  it('rejects reversed/empty periods before SQL',async()=>{
    const tx=transaction([]);await expect(readFinanceEvidenceCloseSources(tx,{businessId,from:to,to,asOf:'2026-10-05T12:00:00Z'})).rejects.toThrow();expect(tx.calls).toHaveLength(0);
  });
});
