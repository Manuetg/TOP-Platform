import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceCommand } from '../../src/modules/finance/domain/finance.types';
import { closeFinanceApp,createFinanceApp,financeFixture,financePaymentFixture,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';

describe('FIN028 cash/public Payment provenance cut on real AppModule/PG; no overrides',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,token:string,accountId:string;
  const root=()=>'/api/businesses/'+fixture.business.id+'/finance';
  const command=(body:FinanceCommand)=>request(app.getHttpServer()).post(root()+'/commands').set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send(body);
  const aging=(asOf:string)=>request(app.getHttpServer()).get(root()+'/v2/aging').set('Authorization','Bearer '+token).query({asOf});
  const planning=(asOf:string)=>request(app.getHttpServer()).post(root()+'/v2/planning-preview').set('Authorization','Bearer '+token).send({asOf,horizonTo:new Date(Date.parse(asOf)+30*86400000).toISOString().slice(0,10),baseToken:'',accountIds:[accountId],events:[],excludedSourceKeys:[]});
  async function cut():Promise<string>{const rows=await prisma.$queryRawUnsafe<{cut:Date}[]>("SELECT date_trunc('milliseconds',clock_timestamp()) AS cut");return rows[0].cut.toISOString();}
  async function afterCut():Promise<void>{await new Promise<void>(resolve=>setTimeout(resolve,10));}
  async function assertPaymentStale(asOf:string):Promise<void>{const a=await aging(asOf).expect(409),p=await planning(asOf).expect(409);expect(String(a.body.message)).toContain('SOURCE_STALE');expect(String(p.body.message)).toContain('SOURCE_STALE');}
  beforeAll(async()=>{app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);token=await realFinanceToken(app,fixture.users.OWNER.id);accountId=(await command({type:'CREATE_ACCOUNT',kind:'BANK',name:'Own registered cash bank',opening:{amountMinor:1000000,occurredAt:'2026-09-01T00:00:00Z',reason:'Owned opening'}}).expect(200)).body.id as string;});
  afterEach(async()=>resetFinanceDatabase(prisma));
  afterAll(async()=>{if(app)await closeFinanceApp(app);});
  it('rejects a late registered backdated cash movement; fresh cut exposes the canonical new balance',async()=>{
    const asOf=await cut();expect((await planning(asOf).expect(200)).body.registeredBalanceMinor).toBe(1000000);await afterCut();
    await command({type:'CASH_MOVEMENT',accountId,kind:'CONTRIBUTION',amountMinor:100000,occurredAt:'2026-10-01T12:00:00Z',reason:'Actual recorded after old cut',openingId:null}).expect(200);
    const old=await planning(asOf).expect(409);expect(String(old.body.message)).toContain('SOURCE_STALE');expect((await planning(await cut()).expect(200)).body.registeredBalanceMinor).toBe(1100000);expect(await prisma.financeCashMovement.count()).toBe(1);
  });
  it('rejects a late backdated public Payment in aging as well as cash projection',async()=>{
    const payment=await financePaymentFixture(prisma,fixture.actor,100000);await command({type:'LINK_PAYMENT',paymentId:payment.payment.id,accountId,expectedVersion:0,reason:'Explicit first account link'}).expect(200);
    const asOf=await cut();await aging(asOf).expect(200);await afterCut();
    await request(app.getHttpServer()).post('/api/businesses/'+fixture.business.id+'/bookings/'+payment.booking.id+'/payments').set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send({amountMinor:200000,method:'CASH',paidAt:'2026-10-01T12:00:00Z',reference:null,note:null}).expect(201);
    await assertPaymentStale(asOf);await aging(await cut()).expect(200);expect(await prisma.payment.count()).toBe(2);
  });
  it('fails closed when already recorded Payment has a future economic date; no historical pending/cash hybrid is emitted',async()=>{
    await financePaymentFixture(prisma,fixture.actor,100000,'2030-12-01T12:00:00Z');await assertPaymentStale(await cut());expect(await prisma.payment.count()).toBe(1);
  });
});
