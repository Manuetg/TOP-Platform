import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import { closeFinanceApp,createFinanceApp,expenseCommand,financeFixture,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';
import { evidenceHash,evidencePdf,evidencePng,exactLimitEvidencePdf,filesCommandKey,ownedFilesProviderFixture,ownEvidenceKeys,removeOwnEvidenceKeys,type FilesProviderFixture } from '../integration/support/finance-evidence-files.fixture';

describe('FIN032 HTTP: real AppModule/JWT/PG/private S3, without provider overrides',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,ownerToken:string,expenseId:string,provider:FilesProviderFixture;
  const root=(businessId=fixture.business.id)=>`/api/businesses/${businessId}/finance`;
  const evidence=(businessId=fixture.business.id,id=expenseId)=>`${root(businessId)}/expenses/${id}/evidence`;
  const authGet=(path:string,token=ownerToken)=>request(app.getHttpServer()).get(path).set('Authorization',`Bearer ${token}`);
  const command=(path:string,body:object,key=filesCommandKey(),token=ownerToken)=>request(app.getHttpServer()).post(path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
  const upload=(bytes:Buffer=evidencePdf,filename='proof.pdf',mimeType='application/pdf',version='1',key=filesCommandKey(),token=ownerToken,path=evidence())=>request(app.getHttpServer()).post(path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).field('expectedVersion',version).attach('file',bytes,{filename,contentType:mimeType});
  beforeAll(async()=>{provider=await ownedFilesProviderFixture();app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);ownerToken=await realFinanceToken(app,fixture.users.OWNER.id);expenseId=(await command(`${root()}/commands`,expenseCommand(fixture)).expect(200)).body.id as string;});
  afterEach(async()=>{if(fixture)await removeOwnEvidenceKeys(provider,fixture.business.id);await resetFinanceDatabase(prisma);});
  afterAll(async()=>{provider?.client.destroy();if(app)await closeFinanceApp(app);});

  it('uploads/downloads exact bytes with private proxy headers, stable retry, and no secret/object URL in responses',async()=>{
    const key=filesCommandKey(),first=await upload(evidencePdf,'comprobante ñ.pdf','application/pdf','1',key).expect(200);
    const repeated=await upload(evidencePdf,'comprobante ñ.pdf','application/pdf','1',key).expect(200);expect(repeated.body).toEqual(first.body);
    expect(first.body).toMatchObject({type:'UPLOAD_FINANCE_EVIDENCE',version:2,file:{filename:'comprobante ñ.pdf',expenseId,expenseVersion:2,sizeBytes:evidencePdf.length,sha256:evidenceHash(evidencePdf),recordedByUserId:fixture.users.OWNER.id}});
    const list=await authGet(evidence()).expect(200);expect(list.body).toMatchObject({enabled:true,retention:'PRESERVE_WITHOUT_PURGE',fileSizeLimitBytes:2097152});expect(list.body.files).toEqual([first.body.file]);
    const binary=await authGet(`${root()}/evidence/${first.body.id as string}/download`).buffer(true).parse((response,done)=>{const chunks:Buffer[]=[];response.on('data',(chunk:Buffer)=>chunks.push(chunk));response.on('end',()=>done(null,Buffer.concat(chunks)));}).expect(200);
    expect(binary.body).toEqual(evidencePdf);expect(binary.headers['content-type']).toContain('application/pdf');expect(binary.headers['content-length']).toBe(String(evidencePdf.length));expect(binary.headers['cache-control']).toBe('private, no-store');expect(binary.headers['x-content-type-options']).toBe('nosniff');expect(binary.headers['content-disposition']).toContain("filename*=UTF-8''comprobante%20%C3%B1.pdf");
    expect(decodeURIComponent(String(binary.headers['content-disposition']).split("filename*=UTF-8''")[1])).toBe('comprobante \u00f1.pdf');
    expect(JSON.stringify([first.body,list.body])).not.toMatch(/storageKey|bucket|https?:|idempotencyKey|fingerprint/);
    const row=await prisma.financeEvidenceFile.findUniqueOrThrow({where:{id:first.body.id as string}}),endpoint=new URL(process.env.S3_ENDPOINT!);endpoint.pathname=`/${provider.bucket}/${row.storageKey}`;
    const anonymous=await fetch(endpoint);expect([403,404]).toContain(anonymous.status);await anonymous.body?.cancel();
    expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(1);
    expect((await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}})).reference).toBeNull();
    const report=await authGet(root()).query({from:'2026-09-01',to:'2026-11-01'}).expect(200);expect(report.body.expenses.find((row:{id:string})=>row.id===expenseId).evidenceMissing).toBe(false);
    const cut=new Date(Date.now()+1000).toISOString(),query={from:'2026-09-01',to:'2026-10-01',asOf:cut};
    const costs=await authGet(`${root()}/v2/costs`).query(query).expect(200);expect(costs.body.coverage.missingEvidenceSourceIds).toEqual([]);
    const alerts=await authGet(`${root()}/v2/alerts`).query(query).expect(200);expect(alerts.body.items.some((row:{kind:string;sourceId:string})=>row.kind==='MISSING_EXPENSE_EVIDENCE'&&row.sourceId===expenseId)).toBe(false);
  });
  it('Multer accepts an exact 2MiB validated PDF and rejects 2MiB+1 before any Expense/File/Request change',async()=>{
    const large=exactLimitEvidencePdf();await upload(large,'boundary.pdf').expect(200);
    const response=await upload(Buffer.concat([large,Buffer.from(' ')]),'oversized.pdf','application/pdf','2');expect(response.status).toBe(413);
    expect((await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}})).version).toBe(2);expect(await prisma.financeEvidenceFile.count()).toBe(1);expect(await prisma.financeRequest.count({where:{operation:'UPLOAD_FINANCE_EVIDENCE'}})).toBe(1);expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(1);
  },30000);
  it('multipart preserves the original Unicode filename including characters outside latin1',async()=>{
    const filename='recibo ā🏡.png',value=await upload(evidencePng,filename,'image/png').expect(200);
    expect(value.body.file.filename).toBe(filename);
    const result=await authGet(`${root()}/evidence/${value.body.id as string}/download`).expect(200);
    expect(result.headers['content-disposition']).toContain("filename*=UTF-8''recibo%20%C4%81%F0%9F%8F%A1.png");
    expect(decodeURIComponent(String(result.headers['content-disposition']).split("filename*=UTF-8''")[1])).toBe(filename);
  });
  it('MIME/magic mismatch, active PDF, control/path filename and extra multipart fields leave no file facts',async()=>{
    await upload(evidencePng,'spoof.pdf','application/pdf').expect(400);
    const active=Buffer.from('%PDF-1.4\n/OpenAction << /S /JavaScript /JS (alert) >>\nstartxref\n0\n%%EOF\n');await upload(active,'active.pdf').expect(400);
    await upload(evidencePdf,'unsafe:name.pdf').expect(400);
    const extra=await request(app.getHttpServer()).post(evidence()).set('Authorization',`Bearer ${ownerToken}`).set('Idempotency-Key',filesCommandKey()).field('expectedVersion','1').field('businessId',fixture.foreignBusiness.id).attach('file',evidencePdf,{filename:'proof.pdf',contentType:'application/pdf'});expect([400,413]).toContain(extra.status);
    expect((await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}})).version).toBe(1);expect(await prisma.financeEvidenceFile.count()).toBe(0);expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(0);
  });
  it.each(['ADMIN','RECEPTIONIST','VIEWER']as const)('%s cannot inherit Evidence access through Finance/Payment legacy capabilities',async role=>{
    const token=await realFinanceToken(app,fixture.users[role].id),value=await upload().expect(200);
    await authGet(evidence(),token).expect(403);await authGet(`${root()}/evidence/${value.body.id as string}/download`,token).expect(403);await upload(evidencePdf,'denied.pdf','application/pdf','2',filesCommandKey(),token).expect(403);
    expect(await prisma.financeEvidenceFile.count()).toBe(1);
  });
  it('authorizes each download/retry again after membership revocation and masks cross-tenant file IDs',async()=>{
    const key=filesCommandKey(),value=await upload(evidencePdf,'proof.pdf','application/pdf','1',key).expect(200),foreignToken=await realFinanceToken(app,fixture.foreignOwner.id);
    await authGet(`${root(fixture.foreignBusiness.id)}/evidence/${value.body.id as string}/download`,foreignToken).expect(404);
    await request(app.getHttpServer()).get(`${root()}/evidence/${value.body.id as string}/download`).expect(401);
    await prisma.userBusinessMembership.delete({where:{userId_businessId:{userId:fixture.users.OWNER.id,businessId:fixture.business.id}}});
    await authGet(`${root()}/evidence/${value.body.id as string}/download`).expect(403);await upload(evidencePdf,'proof.pdf','application/pdf','1',key).expect(403);
    expect(await prisma.financeEvidenceFile.count()).toBe(1);expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(1);
  });
  it('different intent under one key and simultaneous CAS uploads cannot add a second fact',async()=>{
    const results=await Promise.all([upload(evidencePdf,'a.pdf'),upload(evidencePdf,'b.pdf')]);expect(results.map(value=>value.status).sort()).toEqual([200,409]);
    const key=filesCommandKey();await upload(evidencePdf,'second.pdf','application/pdf','2',key).expect(200);await upload(evidencePdf,'changed.pdf','application/pdf','2',key).expect(409);
    expect(await prisma.financeEvidenceFile.count()).toBe(2);expect(await ownEvidenceKeys(provider,fixture.business.id)).toHaveLength(2);
  });
  it('enriches an old closed Expense without changing economic facts or the immutable close package',async()=>{
    const period=await command(`${root()}/periods`,{from:'2026-09-01',to:'2026-10-01',reason:'Synthetic complete month.'}).expect(200);
    const prepared=await authGet(`${root()}/periods/${period.body.id as string}/prepare`).expect(200);
    const acknowledgements=Object.fromEntries(['RECOGNITION_COVERAGE','ACCOUNT_OPENINGS','EVIDENCE','MOVEMENT_REVIEW','CASH_COUNTS'].map(name=>[name,'OWNER accepts the explicit synthetic exception.']));
    const close=await command(`${root()}/periods/${period.body.id as string}/close`,{expectedVersion:period.body.version as number,expectedSourceToken:prepared.body.sourceToken as string,reason:'Synthetic historical package.',acknowledgements}).expect(200);
    const snapshotId=close.body.snapshot.id as string,old=await prisma.financeCloseSnapshot.findUniqueOrThrow({where:{id:snapshotId}}),expense=await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}});
    await upload().expect(200);expect(await prisma.financeExpense.findUniqueOrThrow({where:{id:expenseId}})).toEqual({...expense,version:2});expect(await prisma.financeCloseSnapshot.findUniqueOrThrow({where:{id:snapshotId}})).toEqual(old);
  });
});
