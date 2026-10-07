import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceCommand } from '../../src/modules/finance/domain/finance.types';
import { closeFinanceApp,createFinanceApp,expenseCommand,financeFixture,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';

describe('FIN028 exact inclusive cash instant persisted fixtures on real AppModule/PG; no overrides',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,token:string,accountId:string;
  const root=()=>'/api/businesses/'+fixture.business.id+'/finance';
  const command=(body:FinanceCommand)=>request(app.getHttpServer()).post(root()+'/commands').set('Authorization','Bearer '+token).set('Idempotency-Key',randomUUID()).send(body);
  const planning=(asOf:string)=>request(app.getHttpServer()).post(root()+'/v2/planning-preview').set('Authorization','Bearer '+token).send({asOf,horizonTo:new Date(Date.parse(asOf)+30*86400000).toISOString().slice(0,10),baseToken:'',accountIds:[accountId],events:[],excludedSourceKeys:[]});
  async function cut():Promise<Date>{const rows=await prisma.$queryRawUnsafe<{cut:Date}[]>("SELECT date_trunc('milliseconds',clock_timestamp()) AS cut");return rows[0].cut;}
  beforeAll(async()=>{app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);token=await realFinanceToken(app,fixture.users.OWNER.id);accountId=(await command({type:'CREATE_ACCOUNT',kind:'BANK',name:'Inclusive boundary bank',opening:{amountMinor:1000000,occurredAt:'2026-09-01T00:00:00Z',reason:'Known own synthetic opening'}}).expect(200)).body.id as string;});
  afterEach(async()=>resetFinanceDatabase(prisma));
  afterAll(async()=>{if(app)await closeFinanceApp(app);});
  it('includes persisted exact-cut Payment and its exact-cut account link; fixtures explicitly model recorded-before-cut provenance',async()=>{
    const asOf=await cut(),recordedAt=new Date(asOf.getTime()-1);
    const booking=await prisma.booking.create({data:{businessId:fixture.business.id,status:'CONFIRMED',createdAt:recordedAt,updatedAt:recordedAt}});
    await prisma.pricingSnapshot.create({data:{businessId:fixture.business.id,bookingId:booking.id,currency:'PYG',totalAmountMinor:1000000n,items:[],createdAt:recordedAt}});
    const payment=await prisma.payment.create({data:{businessId:fixture.business.id,bookingId:booking.id,amountMinor:400000n,currency:'PYG',method:'CASH',paidAt:asOf,createdAt:recordedAt,recordedByUserId:fixture.actor.actorUserId,idempotencyKey:randomUUID(),requestFingerprint:'owned-exact-boundary-payment'}});
    await prisma.financePaymentLink.create({data:{businessId:fixture.business.id,paymentId:payment.id,accountId,version:1,recordedByUserId:fixture.actor.actorUserId,createdAt:asOf}});
    const result=await planning(asOf.toISOString()).expect(200);expect(result.body.registeredBalanceMinor).toBe(1400000);expect(result.body.asOf).toBe(asOf.toISOString());expect(result.body.events).toEqual([]);expect(await prisma.payment.count()).toBe(1);
  });
  it('includes exact-cut Settlement and CashMovement but excludes the persisted economic cut+1ms movement',async()=>{
    const expense=await command(expenseCommand(fixture,50000)).expect(200),asOf=await cut(),recordedAt=new Date(asOf.getTime()-1);
    await prisma.financeSettlement.create({data:{businessId:fixture.business.id,expenseId:expense.body.id as string,accountId,amountMinor:50000n,occurredAt:asOf,createdAt:recordedAt,recordedByUserId:fixture.actor.actorUserId}});
    const movement={businessId:fixture.business.id,accountId,kind:'CONTRIBUTION',reason:'Owned synthetic boundary source',recordedByUserId:fixture.actor.actorUserId,createdAt:recordedAt};
    await prisma.financeCashMovement.create({data:{...movement,amountMinor:100000n,occurredAt:asOf}});
    await prisma.financeCashMovement.create({data:{...movement,amountMinor:777000n,occurredAt:new Date(asOf.getTime()+1)}});
    const result=await planning(asOf.toISOString()).expect(200);expect(result.body.registeredBalanceMinor).toBe(1050000);expect(result.body.sources).toEqual([]);expect(result.body.events).toEqual([]);expect(await prisma.financeCashMovement.count()).toBe(2);
  });
});
