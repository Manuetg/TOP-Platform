import type { INestApplication } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/modules/business/business.contract';
import { FinanceUseCases } from '../../src/modules/finance/application/finance.use-cases';
import { FinancialFileIntegrityError } from '../../src/modules/finance/domain/finance-evidence-file.rules';
import { FinanceForbiddenError } from '../../src/modules/finance/domain/finance.errors';
import { closeFinanceApp,createFinanceApp,expenseCommand,financeFixture,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';
import { copyOwnEvidenceToRestore,evidenceHash,evidencePdf,filesCommandKey,ownedFilesProviderFixture,ownEvidenceKeys,realFilesPersistence,removeOwnEvidenceKeys,restoreFilesDatabaseCopy,restoredFilesDatabase,type FilesProviderFixture } from './support/finance-evidence-files.fixture';

describe('FIN032 real PostgreSQL + private S3 + full DB/object restore (no mocked ports)',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,provider:FilesProviderFixture;
  let persistence:ReturnType<typeof realFilesPersistence>,expenseId:string;
  beforeAll(async()=>{provider=await ownedFilesProviderFixture();app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{
    await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);persistence=realFilesPersistence(prisma,provider);
    expenseId=(await app.get(FinanceUseCases).execute(fixture.actor,expenseCommand(fixture),filesCommandKey())).id;
  });
  afterEach(async()=>{if(fixture)await removeOwnEvidenceKeys(provider,fixture.business.id);await resetFinanceDatabase(prisma);});
  afterAll(async()=>{provider?.client.destroy();if(app)await closeFinanceApp(app);});
  const upload=(key=filesCommandKey(),version='1',filename='proof.pdf')=>persistence.useCases.upload(fixture.actor,expenseId,{expectedVersion:version},key,{filename,mimeType:'application/pdf',bytes:evidencePdf});

  it('persists one immutable file/request/audit with Expense CAS; retry returns exactly the original metadata',async()=>{
    const before=await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}}),key=filesCommandKey();
    const first=await upload(key),retry=await upload(key);expect(retry).toEqual(first);
    const changedBytes=Buffer.from('%PDF-1.4\n2 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n');
    await expect(persistence.useCases.upload(fixture.actor,expenseId,{expectedVersion:'1'},key,{filename:'proof.pdf',mimeType:'application/pdf',bytes:changedBytes})).rejects.toThrow('otro');
    const after=await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}});
    expect(after).toEqual({...before,version:2});expect(first.file.sha256).toBe(evidenceHash(evidencePdf));
    expect(await prisma.financeEvidenceFile.count()).toBe(1);
    expect(await prisma.financeRequest.count({where:{operation:'UPLOAD_FINANCE_EVIDENCE'}})).toBe(1);
    expect(await prisma.financeAudit.count({where:{action:'UPLOAD_FINANCE_EVIDENCE'}})).toBe(1);
    const files=await persistence.useCases.list(fixture.actor,expenseId);expect(files.files).toEqual([first.file]);expect(files.retention).toBe('PRESERVE_WITHOUT_PURGE');
    expect((await persistence.useCases.download(fixture.actor,first.id)).bytes).toEqual(evidencePdf);
    expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(1);
    expect(JSON.stringify(files)).not.toMatch(/storageKey|bucket|https?:|idempotencyKey/);
  });
  it('serializes same-key retries and refuses two independent CAS uploads of the same Expense version',async()=>{
    const key=filesCommandKey();const [a,b]=await Promise.all([upload(key),upload(key)]);expect(a).toEqual(b);
    const results=await Promise.allSettled([upload(filesCommandKey(),'2','second-a.pdf'),upload(filesCommandKey(),'2','second-b.pdf')]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
    expect((await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}})).version).toBe(3);expect(await prisma.financeEvidenceFile.count()).toBe(2);expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(2);
  });
  it('known PostgreSQL callback rollback removes only the new object; no Expense version/File/Request survives',async()=>{
    const key=filesCommandKey(),before=await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}});
    await prisma.$executeRawUnsafe(`CREATE FUNCTION finance_files_qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='UPLOAD_FINANCE_EVIDENCE' THEN RAISE EXCEPTION 'finance_files_qa_audit_failure'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER finance_files_qa_fail_audit BEFORE INSERT ON "FinanceAudit" FOR EACH ROW EXECUTE FUNCTION finance_files_qa_fail_audit()`);
    try {await expect(upload(key)).rejects.toThrow('finance_files_qa_audit_failure');}
    finally {await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS finance_files_qa_fail_audit ON "FinanceAudit"');await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS finance_files_qa_fail_audit()');}
    expect(await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}})).toEqual(before);expect(await prisma.financeEvidenceFile.count()).toBe(0);expect(await prisma.financeRequest.count({where:{operation:'UPLOAD_FINANCE_EVIDENCE'}})).toBe(0);expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(0);
    await upload(key);expect(await prisma.financeEvidenceFile.count()).toBe(1);
  });
  it('database triggers reject direct metadata mutation and preserve the immutable stored hash',async()=>{
    const value=await upload();
    await expect(prisma.$executeRawUnsafe('UPDATE "FinanceEvidenceFile" SET sha256=$1 WHERE id=$2','b'.repeat(64),value.id)).rejects.toThrow('FINANCE_EVIDENCE_IMMUTABLE');
    await expect(prisma.$executeRawUnsafe('DELETE FROM "FinanceEvidenceFile" WHERE id=$1',value.id)).rejects.toThrow('FINANCE_EVIDENCE_IMMUTABLE');
    expect((await prisma.financeEvidenceFile.findUniqueOrThrow({where:{id:value.id}})).sha256).toBe(value.file.sha256);
  });
  it('restores the complete own test DB plus objects into separate resources and verifies IDs/FKs/hash/current authorization',async()=>{
    const file=await upload();await copyOwnEvidenceToRestore(provider,fixture.business.id);await restoreFilesDatabaseCopy();
    const restored=await restoredFilesDatabase();
    try {
      const copy=realFilesPersistence(restored,provider,true),checked=await copy.repository.verifyRestoredFiles(fixture.actor);
      expect(checked).toEqual({verifiedFileIds:[file.id],hashes:[{id:file.id,sha256:file.file.sha256}]});
      const rows=await restored.$queryRaw<{id:string;expenseId:string;requestId:string;requestFileId:string}[]>`SELECT f.id,f."expenseId",f."requestId",r.result->>'id' AS "requestFileId" FROM "FinanceEvidenceFile" f JOIN "FinanceExpense" e ON e.id=f."expenseId" AND e."businessId"=f."businessId" JOIN "FinanceRequest" r ON r.id=f."requestId" AND r."businessId"=f."businessId" WHERE f.id=${file.id}`;
      expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:file.id,expenseId,requestFileId:file.id});
      await expect(copy.useCases.download({...fixture.actor,actorUserId:fixture.users.VIEWER.id},file.id)).rejects.toBeInstanceOf(FinanceForbiddenError);
      const stored=await restored.financeEvidenceFile.findUniqueOrThrow({where:{id:file.id}});
      await provider.client.send(new PutObjectCommand({Bucket:provider.restoreBucket,Key:stored.storageKey,Body:Buffer.from('corrupted synthetic copy'),ContentType:'application/pdf',Metadata:{sha256:file.file.sha256},ACL:'private'}));
      await expect(copy.repository.verifyRestoredFiles(fixture.actor)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
      expect((await persistence.useCases.download(fixture.actor,file.id)).bytes).toEqual(evidencePdf);
      expect((await prisma.financeEvidenceFile.findUniqueOrThrow({where:{id:file.id}})).sha256).toBe(file.file.sha256);
    }finally{await restored.$disconnect();}
  },180000);
});
