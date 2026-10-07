import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import { HISTORY_CSV_HEADER } from '../../src/modules/finance/application/finance-v2-import.parser';
import { closeFinanceApp,createFinanceApp,financeFixture,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';

describe('FIN016/020 invalid CSV retains per-row HTTP400 issues through real AppModule/PG; no overrides',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,token:string,accountId:string;
  const root=()=>'/api/businesses/'+fixture.business.id+'/finance';
  const preview=(path:string,body:object,currentToken=token)=>request(app.getHttpServer()).post(root()+'/v2/'+path).set('Authorization','Bearer '+currentToken).send(body);
  beforeAll(async()=>{app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{
    await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);token=await realFinanceToken(app,fixture.users.OWNER.id);
    const account=await request(app.getHttpServer()).post(root()+'/commands').set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send({type:'CREATE_ACCOUNT',kind:'BANK',name:'Own CSV error bank',opening:{amountMinor:1000000,occurredAt:'2026-10-01T00:00:00Z',reason:'Owned test opening'}}).expect(200);accountId=account.body.id as string;
  });
  afterEach(async()=>resetFinanceDatabase(prisma));
  afterAll(async()=>{if(app)await closeFinanceApp(app);});
  it('bank preview retains independent row ordinals, money overflow and date failures without any statement/row/Request write',async()=>{
    const before=await prisma.financeRequest.count(),result=await preview('bank-preview',{accountId,expectedAccountVersion:1,sourceNamespace:'own-errors',csv:'externalKey,bookedOn,amountMinor,reference\nrow-a,2026-10-01,9007199254740992,private row-a\nrow-b,2026-02-30,100,private row-b'}).expect(400);
    expect(result.body).toMatchObject({statusCode:400,error:'Bad Request',previewToken:null,issues:[{ordinal:2,column:'amountMinor',code:'MONEY_OVERFLOW'},{ordinal:3,column:'bookedOn',code:'INVALID_INPUT'}]});
    expect(JSON.stringify(result.body)).not.toMatch(/private row-|canonicalDigest|"totals"|"sources"/);expect(await prisma.financeRequest.count()).toBe(before);expect(await prisma.financeBankStatement.count()).toBe(0);expect(await prisma.financeBankRow.count()).toBe(0);expect((await prisma.financeAccount.findUniqueOrThrow({where:{id:accountId}})).version).toBe(1);
  });
  it('history invalid rowKind retains row2 and row3 and a bad header retains global ordinal0',async()=>{
    const row=(kind:string)=>HISTORY_CSV_HEADER.map(column=>column==='rowKind'?kind:column==='rowKey'?'own-row':'').join(','),csv=[HISTORY_CSV_HEADER.join(','),row('INVALID_A'),row('INVALID_B')].join('\n');
    const result=await preview('history-preview',{sourceNamespace:'own-errors',csv}).expect(400);
    expect(result.body.previewToken).toBeNull();expect(result.body.issues).toEqual([{ordinal:2,column:'rowKind',code:'INVALID_INPUT',message:'ROW_KIND_INVALID: rowKind'},{ordinal:3,column:'rowKind',code:'INVALID_INPUT',message:'ROW_KIND_INVALID: rowKind'}]);
    const header=await preview('history-preview',{sourceNamespace:'own-errors',csv:'wrong,header\nrow,value'}).expect(400);expect(header.body.issues[0].ordinal).toBe(0);expect(header.body.previewToken).toBeNull();expect(await prisma.financeImportBatch.count()).toBe(0);
  });
  it('Viewer fails authorization before receiving parsed CSV issues',async()=>{
    const viewer=await realFinanceToken(app,fixture.users.VIEWER.id),result=await preview('bank-preview',{accountId,expectedAccountVersion:1,sourceNamespace:'own-errors',csv:'invalid private CSV'},viewer).expect(403);expect(result.body).not.toHaveProperty('issues');expect(result.body).not.toHaveProperty('previewToken');expect(await prisma.financeBankRow.count()).toBe(0);
  });
});
