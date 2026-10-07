import { parseFinanceEvidenceUpload } from './finance-evidence-upload.parser';

const actor={businessId:'11111111-1111-4111-8111-111111111111',actorUserId:'22222222-2222-4222-8222-222222222222'};
const expenseId='33333333-3333-4333-8333-333333333333';
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n');
const file={filename:'proof.pdf',mimeType:'application/pdf',bytes:pdf};
const key='file-idempotency-0001';

describe('Finance evidence closed multipart parser',()=>{
  it('derives binary hash server-side and fingerprints expense/version/metadata exactly',()=>{
    const one=parseFinanceEvidenceUpload(actor,expenseId,{expectedVersion:'1'},key,file);
    const two=parseFinanceEvidenceUpload(actor,expenseId,{expectedVersion:'1'},key,{...file,bytes:Buffer.from(pdf)});
    expect(one.fingerprint).toBe(two.fingerprint);expect(one.file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(one.file.bytes).not.toBe(pdf);
    expect(parseFinanceEvidenceUpload(actor,expenseId,{expectedVersion:'2'},key,file).fingerprint).not.toBe(one.fingerprint);
    expect(parseFinanceEvidenceUpload(actor,expenseId,{expectedVersion:'1'},key,{...file,filename:'changed.pdf'}).fingerprint).not.toBe(one.fingerprint);
  });
  it.each([{}, {expectedVersion:1},{expectedVersion:'0'},{expectedVersion:'01'},{expectedVersion:'1.0'},{expectedVersion:'1e1'},{expectedVersion:'2147483647'},{expectedVersion:'1',role:'OWNER'},{expectedVersion:'1',businessId:actor.businessId},{expectedVersion:'1',sha256:'a'.repeat(64)}])('rejects missing/noncanonical/foreign-scope command fields %#',body=>{
    expect(()=>parseFinanceEvidenceUpload(actor,expenseId,body,key,file)).toThrow();
  });
  it('accepts the null-prototype body produced by multipart middleware',()=>{
    const body=Object.assign(Object.create(null)as object,{expectedVersion:'1'});
    expect(parseFinanceEvidenceUpload(actor,expenseId,body,key,file).expectedVersion).toBe(1);
  });
  it('rejects missing file, ambiguous key and path IDs before constructing a repository mutation',()=>{
    expect(()=>parseFinanceEvidenceUpload(actor,expenseId,{expectedVersion:'1'},key,{filename:undefined,mimeType:undefined,bytes:undefined})).toThrow();
    expect(()=>parseFinanceEvidenceUpload(actor,expenseId,{expectedVersion:'1'},'too-short',file)).toThrow();
    expect(()=>parseFinanceEvidenceUpload(actor,'../foreign',{expectedVersion:'1'},key,file)).toThrow();
  });
});
