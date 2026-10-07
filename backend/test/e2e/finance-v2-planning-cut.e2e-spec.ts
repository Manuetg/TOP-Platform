import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceCommand } from '../../src/modules/finance/domain/finance.types';
import type { FinanceV2Command } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp,createFinanceApp,expenseCommand,financeFixture,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';

describe('FIN028 real PostgreSQL/HTTP historical cut guard; AppModule without overrides',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,token:string,accountId:string;
  const root=()=>`/api/businesses/${fixture.business.id}/finance`;
  const command=(body:FinanceCommand)=>request(app.getHttpServer()).post(`${root()}/commands`).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',randomUUID()).send(body);
  const v2Command=(body:FinanceV2Command)=>request(app.getHttpServer()).post(`${root()}/v2/commands`).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',randomUUID()).send(body);
  const aging=(asOf:string)=>request(app.getHttpServer()).get(`${root()}/v2/aging`).set('Authorization',`Bearer ${token}`).query({asOf});
  const planning=(asOf:string)=>request(app.getHttpServer()).post(`${root()}/v2/planning-preview`).set('Authorization',`Bearer ${token}`).send({asOf,horizonTo:new Date(Date.parse(asOf)+30*86400000).toISOString().slice(0,10),baseToken:'',accountIds:[accountId],events:[],excludedSourceKeys:[]});
  const commitment=(expectedConsumptionOn='2026-09-30')=>v2Command({type:'CREATE_COMMITMENT',description:'Cut integrity commitment.',amountMinor:900000,categoryId:fixture.category.id,resourceId:null,expectedConsumptionOn,dueOn:null,operational:true,reference:null,reason:'Synthetic cut integrity proof.'});
  const conversion=(id:string,consumedOn='2026-09-30')=>v2Command({type:'CONVERT_COMMITMENT',id,expectedVersion:1,expenseDraftId:null,expectedDraftVersion:null,expense:{description:'Actual converted cost.',amountMinor:300000,counterpartyId:null,reference:null,lines:[{label:'Actual cost',categoryId:fixture.category.id,resourceId:null,bookingId:null,amountMinor:300000,operational:true}],consumedOn,dueOn:null,settlement:null},reason:'Synthetic conversion.'});
  const settle=(id:string,occurredAt:string)=>command({type:'SETTLE_EXPENSE',id,expectedVersion:1,settlement:{accountId,amountMinor:100000,occurredAt,reference:null}});
  async function cut():Promise<string>{const rows=await prisma.$queryRaw<{cut:Date}[]>`SELECT date_trunc('milliseconds',clock_timestamp()) AS cut`;return rows[0].cut.toISOString();}
  async function afterCut():Promise<void>{await new Promise<void>(resolve=>setTimeout(resolve,10));}
  async function assertStale(asOf:string):Promise<void>{
    const a=await aging(asOf).expect(409),p=await planning(asOf).expect(409);expect(String(a.body.message)).toContain('SOURCE_STALE');expect(String(p.body.message)).toContain('SOURCE_STALE');
  }
  beforeAll(async()=>{app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);token=await realFinanceToken(app,fixture.users.OWNER.id);accountId=(await command({type:'CREATE_ACCOUNT',kind:'BANK',name:'Own cut integrity bank',opening:{amountMinor:1000000,occurredAt:'2026-09-01T00:00:00Z',reason:'Owned synthetic opening.'}}).expect(200)).body.id as string;});
  afterEach(async()=>{await resetFinanceDatabase(prisma);});
  afterAll(async()=>{if(app)await closeFinanceApp(app);});

  it('rejects a settlement recorded after the old cut, even when its economic occurredAt is earlier',async()=>{
    const expense=await command(expenseCommand(fixture)).expect(200),asOf=await cut();await aging(asOf).expect(200);await afterCut();
    await settle(expense.body.id as string,'2026-09-30T12:00:00Z').expect(200);await assertStale(asOf);
    const refreshed=await aging(await cut()).expect(200);expect(refreshed.body.rows.find((row:{expenseId:string})=>row.expenseId===expense.body.id).amountMinor).toBe(800000);
  });
  it('rejects a post-cut commitment cancellation rather than silently using its current state',async()=>{
    const value=await commitment().expect(200),asOf=await cut(),before=await planning(asOf).expect(200);expect(before.body.sources.some((source:{origin:string})=>source.origin==='COMMITMENT')).toBe(true);await afterCut();
    await v2Command({type:'CANCEL_COMMITMENT',id:value.body.id as string,expectedVersion:1,reason:'Synthetic cancellation after cut.'}).expect(200);await assertStale(asOf);
    const refreshed=await planning(await cut()).expect(200);expect(refreshed.body.sources.some((source:{origin:string})=>source.origin==='COMMITMENT')).toBe(false);
  });
  it('rejects a post-cut conversion before emitting a catalog with mixed commitment and Expense versions',async()=>{
    const value=await commitment().expect(200),asOf=await cut();await planning(asOf).expect(200);await afterCut();await conversion(value.body.id as string).expect(200);await assertStale(asOf);
    const refreshed=await planning(await cut()).expect(200);expect(refreshed.body.sources.filter((source:{origin:string})=>source.origin==='COMMITMENT')).toEqual([expect.objectContaining({amountMinor:600000})]);expect(refreshed.body.sources.filter((source:{origin:string})=>source.origin==='PAYABLE')).toEqual([expect.objectContaining({amountMinor:300000})]);
  });
  it('fails closed for a settlement already recorded with an economic instant later than the requested cut',async()=>{
    const expense=await command(expenseCommand(fixture)).expect(200);
    await settle(expense.body.id as string,'2030-12-01T12:00:00Z').expect(200);await assertStale(await cut());
    const future=await aging('2030-12-02T12:00:00Z').expect(400);expect(String(future.body.message)).toContain('futuro');
  });
  it('fails closed for a conversion already recorded against an Expense consumed on a future local date',async()=>{
    const value=await commitment('2030-12-01').expect(200);await conversion(value.body.id as string,'2030-12-01').expect(200);await assertStale(await cut());
    const future=await planning('2030-12-02T12:00:00Z').expect(400);expect(String(future.body.message)).toContain('futuro');
  });
  it('ignores a foreign post-cut commitment and keeps the catalog tenant-isolated',async()=>{
    const asOf=await cut();await afterCut();const foreign=await prisma.financeCommitment.create({data:{businessId:fixture.foreignBusiness.id,description:'Foreign source never in own cut.',amountMinor:123456n,expectedConsumptionOn:new Date('2030-12-01'),operational:true,reason:'Owned foreign synthetic tenant.',recordedByUserId:fixture.foreignOwner.id}});
    await aging(asOf).expect(200);const own=await planning(asOf).expect(200);expect(JSON.stringify(own.body.sources)).not.toContain(foreign.id);expect(own.body.sources).toEqual([]);
  });
});
