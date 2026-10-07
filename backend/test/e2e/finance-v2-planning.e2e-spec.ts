import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { ExpenseDefinition,FinanceCashProjection,FinanceCostReport } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp,createFinanceApp,expenseCommand,financeFixture,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';

const period={from:'2026-09-01',to:'2026-10-01'};
describe('FIN025..028 real costs, budget/commitment and cash projection through AppModule/PG (no port overrides)',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,ownerToken:string;
  const root=()=>`/api/businesses/${fixture.business.id}/finance`;
  const post=(path:string,body:object,key=randomUUID(),token=ownerToken)=>request(app.getHttpServer()).post(path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
  const command=(body:object,key=randomUUID())=>post(`${root()}/v2/commands`,body,key);
  const get=(path:string,token=ownerToken)=>request(app.getHttpServer()).get(`${root()}/v2/${path}`).set('Authorization',`Bearer ${token}`);
  const definition=(amountMinor=900000,resourceId:string|null=fixture.resource.id):ExpenseDefinition=>({description:'Actual source',counterpartyId:fixture.counterparty.id,reference:null,amountMinor,lines:[{label:'Actual source line',categoryId:fixture.category.id,resourceId,bookingId:null,amountMinor,operational:true}]});
  const currentCut=()=>new Date().toISOString();
  const costs=(asOf=currentCut())=>get('costs').query({...period,asOf});
  const createExpense=(amountMinor=900000,resourceId:string|null=fixture.resource.id)=>post(`${root()}/commands`,{...expenseCommand(fixture,amountMinor),lines:[{...expenseCommand(fixture,amountMinor).lines[0],resourceId}]}).expect(200);
  beforeAll(async()=>{app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);ownerToken=await realFinanceToken(app,fixture.users.OWNER.id);});
  afterEach(async()=>resetFinanceDatabase(prisma));
  afterAll(async()=>{if(app)await closeFinanceApp(app);});

  it('FIN025 common allocation conserves every PYG and reads the actual captured source; stale source/CAS cannot reapply',async()=>{
    const other=await prisma.resource.create({data:{businessId:fixture.business.id,name:'Second own unit',internalCode:'QA-COST-2',capacityMaximum:2}}),expense=await createExpense(100001,null),line=await prisma.financeExpenseLine.findFirstOrThrow({where:{expenseId:expense.body.id as string}});
    const rule=await command({type:'CREATE_ALLOCATION_RULE',name:'Explicit common rule',validFrom:'2026-09-01',validTo:null,parts:[{resourceId:fixture.resource.id,basisPoints:3333},{resourceId:other.id,basisPoints:6667}]}).expect(200);
    const allocation={type:'APPLY_COST_ALLOCATION',source:{kind:'EXPENSE_LINE',id:line.id},expectedSourceVersion:1,ruleId:rule.body.id as string,ruleVersion:1,expectedAllocationVersion:0,reason:'Owner chooses source allocation.'},key=randomUUID();
    const first=await command(allocation,key).expect(200),replay=await command(allocation,key).expect(200);expect(first.body).toEqual(replay.body);await command(allocation).expect(409);
    const report=(await costs().expect(200)).body as FinanceCostReport,row=report.rows.find(row=>row.expenseLineId===line.id)!;
    expect(row).toMatchObject({basis:'ACTUAL',kind:'COMMON',amountMinor:100001,unassignedMinor:0,allocationVersion:1});expect(row.destinations).toEqual(expect.arrayContaining([{resourceId:fixture.resource.id,amountMinor:33330},{resourceId:other.id,amountMinor:66671}]));expect(row.destinations.reduce((sum,part)=>sum+part.amountMinor,0)).toBe(100001);expect(report.totals.actualCostMinor).toBe(100001);
  });
  it('actual labor replaces its estimate; Owner work stays separate and unknown labor is null rather than fabricated zero',async()=>{
    const estimate=await command({type:'CREATE_LABOR_COST',label:'Already calculated labor',personLabel:'Synthetic label',periodMonth:'2026-09',consumedOn:'2026-09-30',kind:'PRECOMPUTED_LABOR',actualExpenseLineId:null,estimatedMinor:120000,reason:'Explicit provisional estimate.'}).expect(200);
    const first=(await costs().expect(200)).body as FinanceCostReport;expect(first.totals).toMatchObject({actualCostMinor:0,estimatedSelectedMinor:120000});
    const expense=await createExpense(150000),line=await prisma.financeExpenseLine.findFirstOrThrow({where:{expenseId:expense.body.id as string}});
    await command({type:'REVISE_LABOR_COST',id:estimate.body.id as string,expectedVersion:1,actualExpenseLineId:line.id,estimatedMinor:null,reason:'Actual document supersedes estimate.'}).expect(200);
    await command({type:'CREATE_LABOR_COST',label:'Owner work',personLabel:null,periodMonth:'2026-09',consumedOn:'2026-09-30',kind:'OWNER_IMPUTED',actualExpenseLineId:null,estimatedMinor:80000,reason:'Owner declares opportunity cost.'}).expect(200);
    await command({type:'CREATE_LABOR_COST',label:'Incomplete labor source',personLabel:null,periodMonth:'2026-09',consumedOn:'2026-09-30',kind:'PRECOMPUTED_LABOR',actualExpenseLineId:null,estimatedMinor:null,reason:'Amount has not been determined.'}).expect(200);
    const report=(await costs().expect(200)).body as FinanceCostReport;expect(report.totals).toMatchObject({actualCostMinor:150000,estimatedSelectedMinor:0,ownerImputedMinor:80000,unknownSourceCount:1});expect(report.rows.filter(row=>row.expenseLineId===line.id)).toHaveLength(1);expect(report.rows.find(row=>row.amountMinor===null)).toMatchObject({unassignedMinor:null,basis:'ESTIMATE'});
  });
  it('real historical cut excludes later Expense/labor revisions; explicit offset and UTC cuts produce identical source token',async()=>{
    const earlier=new Date(Date.now()-1000).toISOString();await createExpense(150000);
    await command({type:'CREATE_LABOR_COST',label:'Later estimate',personLabel:null,periodMonth:'2026-09',consumedOn:'2026-09-30',kind:'PRECOMPUTED_LABOR',actualExpenseLineId:null,estimatedMinor:120000,reason:'Later source.'}).expect(200);
    const historical=(await costs(earlier).expect(200)).body as FinanceCostReport;expect(historical.rows).toEqual([]);expect(historical.totals).toMatchObject({actualCostMinor:0,estimatedSelectedMinor:0});
    const cut=currentCut(),offset=new Date(Date.parse(cut)+3*3600000).toISOString().replace('Z','+03:00');
    const [utc,local]=await Promise.all([costs(cut).expect(200),costs(offset).expect(200)]);expect(local.body.rows).toEqual(utc.body.rows);expect(local.body.token).toBe(utc.body.token);
  });
  it('FIN026/027 unapproved budget is unknown; partial conversion moves commitment to actual once and cancellation clears only remaining commitment',async()=>{
    const budget=await command({type:'CREATE_BUDGET_REVISION',periodMonth:'2026-09',expectedBudgetVersion:0,lines:[{categoryId:fixture.category.id,resourceId:fixture.resource.id,approvedMinor:1000000}],reason:'Owner proposed budget.'}).expect(200);
    const unknown=await get('budget-comparison').query({periodMonth:'2026-09'}).expect(200);expect(unknown.body).toMatchObject({budgetId:budget.body.id as string,approvedRevisionId:null,lines:[],forecastBasis:null,scenarioToken:null});
    await command({type:'APPROVE_BUDGET_REVISION',id:budget.body.relatedIds.revisionId as string,expectedBudgetVersion:1,reason:'Owner approves exact revision.'}).expect(200);
    const planned=await command({type:'CREATE_COMMITMENT',description:'Own planned maintenance',amountMinor:900000,categoryId:fixture.category.id,resourceId:fixture.resource.id,expectedConsumptionOn:'2026-09-30',dueOn:'2026-10-10',operational:true,reference:null,reason:'Planned amount is not actual.'}).expect(200);
    let comparison=await get('budget-comparison').query({periodMonth:'2026-09'}).expect(200);expect(comparison.body.lines[0]).toMatchObject({approvedMinor:1000000,actualMinor:0,committedPendingMinor:900000,forecastMinor:null});
    const conversion={type:'CONVERT_COMMITMENT',id:planned.body.id as string,expectedVersion:1,expenseDraftId:null,expectedDraftVersion:null,expense:{...definition(600000),consumedOn:'2026-09-30',dueOn:'2026-10-10',settlement:null},reason:'Explicit partial source conversion.'},key=randomUUID();
    const first=await command(conversion,key).expect(200),retry=await command(conversion,key).expect(200);expect(retry.body).toEqual(first.body);
    comparison=await get('budget-comparison').query({periodMonth:'2026-09'}).expect(200);expect(comparison.body.lines[0]).toMatchObject({actualMinor:600000,committedPendingMinor:300000,actualDeviationMinor:-400000,forecastMinor:null});expect(await prisma.financeExpense.count()).toBe(1);expect(await prisma.financeCommitmentConversion.count()).toBe(1);
    await command({...conversion,expectedVersion:2,expense:{...definition(400000),consumedOn:'2026-09-30',dueOn:null,settlement:null}}).expect(400);
    await command({type:'CANCEL_COMMITMENT',id:planned.body.id as string,expectedVersion:2,reason:'Cancel unconsumed remainder.'}).expect(200);
    comparison=await get('budget-comparison').query({periodMonth:'2026-09'}).expect(200);expect(comparison.body.lines[0]).toMatchObject({actualMinor:600000,committedPendingMinor:0});expect(await prisma.financeExpense.count()).toBe(1);
  });
  it('FIN028 bootstrap catalog exposes real sources; explicit weighted scenario is read-only and stale base requires refresh',async()=>{
    const account=await post(`${root()}/commands`,{type:'CREATE_ACCOUNT',kind:'BANK',name:'Known own bank',opening:{amountMinor:1000000,occurredAt:'2026-10-01T00:00:00Z',reason:'Known opening.'}}).expect(200);await createExpense(900000);
    const before=await prisma.financeRequest.count(),input={asOf:currentCut(),horizonTo:'2026-11-01',baseToken:'',accountIds:[account.body.id as string],events:[],excludedSourceKeys:[]};
    const bootstrap=(await post(`${root()}/v2/planning-preview`,input).expect(200)).body as FinanceCashProjection;
    expect(bootstrap.events).toEqual([]);expect(bootstrap.forecastDeltaMinor).toBe(0);expect(bootstrap.registeredBalanceMinor).toBe(1000000);
    const source=bootstrap.sources.find(source=>source.origin==='PAYABLE')!;expect(source).toMatchObject({direction:'OUT',amountMinor:900000,expectedOn:'2026-10-10',accountId:null,reviewRequired:false});
    const event={sourceKey:source.sourceKey,direction:'OUT',amountMinor:100001,expectedOn:'2026-10-10',probabilityBasisPoints:5000,accountId:account.body.id as string,reason:'Owner chooses partial scenario.'};
    const projected=(await post(`${root()}/v2/planning-preview`,{...input,baseToken:bootstrap.token,events:[event]}).expect(200)).body as FinanceCashProjection;
    expect(projected).toMatchObject({forecastDeltaMinor:-50000,projectedBalanceMinor:950000});expect(projected.sources).toEqual(bootstrap.sources);expect(await prisma.financeRequest.count()).toBe(before);expect(await prisma.financeSettlement.count()).toBe(0);
    await createExpense(100000);await post(`${root()}/v2/planning-preview`,{...input,baseToken:bootstrap.token,events:[event]}).expect(409);
    const refreshed=await post(`${root()}/v2/planning-preview`,{...input,asOf:currentCut()}).expect(200);expect(refreshed.body.token).not.toBe(bootstrap.token);expect(refreshed.body.events).toEqual([]);
  });
  it('unknown opening stays null and undated obligations stay selectable without an invented date; no foreign/duplicate sources',async()=>{
    const account=await post(`${root()}/commands`,{type:'CREATE_ACCOUNT',kind:'BANK',name:'Opening unknown',opening:null}).expect(200);
    await post(`${root()}/commands`,{...expenseCommand(fixture,100000),dueOn:null}).expect(200);
    await command({type:'CREATE_COMMITMENT',description:'Undated planned cost',amountMinor:200000,categoryId:null,resourceId:null,expectedConsumptionOn:'2026-10-20',dueOn:null,operational:true,reference:null,reason:'No payment date agreed.'}).expect(200);
    const preview=(await post(`${root()}/v2/planning-preview`,{asOf:currentCut(),horizonTo:'2026-11-01',baseToken:'',accountIds:[account.body.id as string],events:[],excludedSourceKeys:[]}).expect(200)).body as FinanceCashProjection;
    expect(preview.registeredBalanceMinor).toBeNull();expect(preview.projectedBalanceMinor).toBeNull();expect(preview.sources).toHaveLength(2);expect(preview.sources.every(source=>source.expectedOn===null)).toBe(true);expect(preview.coverage.undatedSourceKeys.sort()).toEqual(preview.sources.map(source=>source.sourceKey).sort());expect(preview.events).toEqual([]);
    const token=await realFinanceToken(app,fixture.users.VIEWER.id);await get('aging',token).query({asOf:currentCut()}).expect(403);await post(`${root()}/v2/planning-preview`,{asOf:currentCut(),horizonTo:'2026-11-01',baseToken:'',accountIds:[account.body.id as string],events:[],excludedSourceKeys:[]},randomUUID(),token).expect(403);
  });
});
