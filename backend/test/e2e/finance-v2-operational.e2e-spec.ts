import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { ExpenseDefinition,FinanceHistoryPreview,FinanceV2Result } from '../../src/modules/finance/domain/finance-v2.types';
import { HISTORY_CSV_HEADER } from '../../src/modules/finance/application/finance-v2-import.parser';
import { closeFinanceApp,createFinanceApp,expenseCommand,financeFixture,financePeriod,realFinanceToken,resetFinanceDatabase,type FinanceFixture } from '../fixtures/finance-fixture';

function historyRow(input:Partial<Record<typeof HISTORY_CSV_HEADER[number],string>>):string{return HISTORY_CSV_HEADER.map(column=>`"${(input[column]??'').replaceAll('"','""')}"`).join(',');}

describe('Finance V2 operational HTTP: real AppModule/JWT/PG, no Finance/Booking/Pricing/Payment overrides',()=>{
  let app:INestApplication,prisma:PrismaClient,fixture:FinanceFixture,ownerToken:string;
  const root=(businessId=fixture.business.id)=>`/api/businesses/${businessId}/finance`;
  const post=(path:string,body:object,key=randomUUID(),token=ownerToken)=>request(app.getHttpServer()).post(path).set('Authorization',`Bearer ${token}`).set('Idempotency-Key',key).send(body);
  const command=(body:object,key=randomUUID(),token=ownerToken)=>post(`${root()}/v2/commands`,body,key,token);
  const get=(path:string,token=ownerToken)=>request(app.getHttpServer()).get(path).set('Authorization',`Bearer ${token}`);
  const definition=(amountMinor=900000):ExpenseDefinition=>({description:'Synthetic source cost',counterpartyId:fixture.counterparty.id,reference:null,amountMinor,lines:[{label:'Real source',categoryId:fixture.category.id,resourceId:fixture.resource.id,bookingId:null,amountMinor,operational:true}]});
  const draft=(expenseDefinition=definition())=>command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition,consumedOn:'2026-09-30',dueOn:'2026-10-10'});
  const bank=(opening:{amountMinor:number;occurredAt:string;reason:string}|null={amountMinor:1000000,occurredAt:'2026-10-01T00:00:00Z',reason:'Synthetic known opening.'})=>post(`${root()}/commands`,{type:'CREATE_ACCOUNT',kind:'BANK',name:'Own synthetic bank',opening});
  beforeAll(async()=>{app=await createFinanceApp();prisma=app.get(PrismaService);});
  beforeEach(async()=>{await resetFinanceDatabase(prisma);fixture=await financeFixture(prisma);ownerToken=await realFinanceToken(app,fixture.users.OWNER.id);});
  afterEach(async()=>resetFinanceDatabase(prisma));
  afterAll(async()=>{if(app)await closeFinanceApp(app);});

  it('FIN019 manually generates one captured recurring draft per month; template revision never rewrites it or creates a scheduled expense',async()=>{
    const template=await command({type:'CREATE_EXPENSE_TEMPLATE',name:'Manual recurrence',expenseDefinition:definition(100001)}).expect(200);
    const body={type:'GENERATE_RECURRING_DRAFT',templateId:template.body.id as string,expectedTemplateVersion:1,periodMonth:'2026-09',consumedOn:'2026-09-30',dueOn:'2026-10-10'};
    const key=randomUUID(),first=await command(body,key).expect(200),retry=await command(body,key).expect(200);expect(retry.body).toEqual(first.body);
    const once=await command(body).expect(200);expect(once.body).toMatchObject({id:first.body.id,alreadyGenerated:true});expect(await prisma.financeExpense.count()).toBe(0);expect(await prisma.financeExpenseDraft.count()).toBe(1);
    const original=await get(`${root()}/v2/drafts/${first.body.id as string}`).expect(200);
    await command({type:'REVISE_EXPENSE_TEMPLATE',id:template.body.id as string,expectedVersion:1,expenseDefinition:definition(200003),reason:'Future template revision.'}).expect(200);
    const unchanged=await get(`${root()}/v2/drafts/${first.body.id as string}`).expect(200);expect(unchanged.body.draft).toEqual(original.body.draft);
    const confirmed=await command({type:'CONFIRM_EXPENSE_DRAFT',id:first.body.id as string,expectedVersion:1,settlement:null,reason:'Explicit Owner confirmation.'}).expect(200);
    expect((await prisma.financeExpense.findUniqueOrThrow({where:{id:confirmed.body.relatedIds.expenseId as string}})).amountMinor).toBe(100001n);expect(await prisma.financeExpense.count()).toBe(1);
    await command({type:'CONFIRM_EXPENSE_DRAFT',id:first.body.id as string,expectedVersion:2,settlement:null,reason:'No duplicate.'}).expect(409);
  });
  it('FIN019 default policy is explicit disabled; enabled policy blocks direct V1 expense and requires a different current Owner',async()=>{
    const initial=await get(`${root()}/v2/approval-policy`).expect(200);expect(initial.body).toMatchObject({id:null,version:0,enabled:false});
    const secondOwner=await prisma.user.create({data:{email:`approval-owner-${randomUUID()}@top.test`,emailVerifiedAt:new Date('2026-01-01')}});await prisma.userBusinessMembership.create({data:{userId:secondOwner.id,businessId:fixture.business.id,role:'OWNER'}});const secondToken=await realFinanceToken(app,secondOwner.id);
    const policy=await command({type:'SET_EXPENSE_APPROVAL_POLICY',expectedPolicyVersion:0,enabled:true,scope:'ALL_NEW_EXPENSE_CONFIRMATIONS',requireDifferentActor:true,reason:'Owner explicitly enables approval.'}).expect(200);
    await post(`${root()}/commands`,expenseCommand(fixture)).expect(409);
    const value=await draft().expect(200);await command({type:'CONFIRM_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:1,settlement:null,reason:'Approval missing.'}).expect(409);
    await command({type:'SUBMIT_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:1,expectedPolicyVersion:1,reason:'Submit.'}).expect(200);
    const decision={type:'DECIDE_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:2,policyRevisionId:policy.body.id as string,decision:'APPROVE',reason:'Second Owner verifies.'};
    await command(decision).expect(403);await command(decision,randomUUID(),secondToken).expect(200);
    await command({type:'EDIT_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:3,expenseDefinition:definition(800000),consumedOn:'2026-09-30',dueOn:null,reason:'Cannot edit approved.'}).expect(409);
    await command({type:'CONFIRM_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:3,settlement:null,reason:'Confirm approved source.'}).expect(200);expect(await prisma.financeExpense.count()).toBe(1);expect(await prisma.financeDraftDecision.count()).toBe(1);
  });
  it('captured enabled policy cannot be bypassed by disabling the current policy after submission',async()=>{
    await command({type:'SET_EXPENSE_APPROVAL_POLICY',expectedPolicyVersion:0,enabled:true,scope:'ALL_NEW_EXPENSE_CONFIRMATIONS',requireDifferentActor:true,reason:'Enable.'}).expect(200);
    const value=await draft().expect(200);await command({type:'SUBMIT_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:1,expectedPolicyVersion:1,reason:'Capture policy revision.'}).expect(200);
    await command({type:'SET_EXPENSE_APPROVAL_POLICY',expectedPolicyVersion:1,enabled:false,scope:'ALL_NEW_EXPENSE_CONFIRMATIONS',requireDifferentActor:true,reason:'Future policy change.'}).expect(200);
    await command({type:'CONFIRM_EXPENSE_DRAFT',id:value.body.id as string,expectedVersion:2,settlement:null,reason:'Still requires captured approval.'}).expect(409);expect(await prisma.financeExpense.count()).toBe(0);
  });
  it('FIN019 reimbursement records one consumption and pays a creditor with own cash without creating another expense',async()=>{
    const account=await bank().expect(200),created=await command({type:'CREATE_REIMBURSEMENT_DRAFT',expenseDefinition:definition(),consumedOn:'2026-09-30',dueOn:'2026-10-10',creditorCounterpartyId:fixture.counterparty.id,supplierCounterpartyId:null,externallyPaidOn:'2026-09-30',privateReference:'Synthetic private proof'}).expect(200);
    await command({type:'CONFIRM_EXPENSE_DRAFT',id:created.body.id as string,expectedVersion:1,settlement:{accountId:account.body.id as string,amountMinor:900000,occurredAt:'2026-10-02T12:00:00Z',reference:null},reason:'External initial payment must not consume own cash.'}).expect(400);
    const confirmed=await command({type:'CONFIRM_EXPENSE_DRAFT',id:created.body.id as string,expectedVersion:1,settlement:null,reason:'Record the existing consumption once.'}).expect(200),expenseId=confirmed.body.relatedIds.expenseId as string;
    const before=await get(root()).query(financePeriod).expect(200);expect(before.body.totals).toMatchObject({operatingCostMinor:900000,outstandingMinor:900000,registeredBalanceMinor:1000000});
    const body={type:'REIMBURSE_EXPENSE',expenseId,expectedVersion:1,settlement:{accountId:account.body.id as string,amountMinor:300000,occurredAt:'2026-10-02T12:00:00Z',reference:'Own cash reimbursement.'},reason:'Partial reimbursement.'},key=randomUUID();
    const paid=await command(body,key).expect(200),retry=await command(body,key).expect(200);expect(retry.body).toEqual(paid.body);
    const after=await get(root()).query(financePeriod).expect(200);expect(after.body.totals).toMatchObject({operatingCostMinor:900000,outstandingMinor:600000,registeredBalanceMinor:700000});expect(await prisma.financeExpense.count()).toBe(1);expect(await prisma.financeSettlement.count()).toBe(1);expect(await prisma.financeReimbursementClaim.count()).toBe(1);
  });
  it('FIN016 preview is read-only and atomic confirmation excludes only the explicitly preopening settlement from cash',async()=>{
    const account=await bank(null).expect(200),accountId=account.body.id as string;
    const csv=[HISTORY_CSV_HEADER.join(','),historyRow({rowKind:'OPENING',rowKey:'opening-1',accountId,amountMinor:'1000000',occurredAt:'2026-10-01T00:00:00Z',reason:'Own historical opening.'}),historyRow({rowKind:'EXPENSE_LINE',rowKey:'line-1',documentKey:'expense-1',description:'Historical own consumption',consumedOn:'2026-09-20',documentAmountMinor:'900000',lineOrdinal:'1',label:'Cost',categoryId:fixture.category.id,lineAmountMinor:'900000',operational:'true'}),historyRow({rowKind:'SETTLEMENT',rowKey:'settlement-1',accountId,expenseDocumentKey:'expense-1',amountMinor:'300000',occurredAt:'2026-09-25T12:00:00Z',includedInOpening:'true'})].join('\n');
    const input={sourceNamespace:'own-history-qa',csv},preview=(await post(`${root()}/v2/history-preview`,input).expect(200)).body as FinanceHistoryPreview;
    expect(preview.issues).toEqual([]);expect(preview.totals).toMatchObject({expenseMinor:900000,settlementMinor:300000,excludedCashMinor:300000});expect(await prisma.financeExpense.count()).toBe(0);expect(await prisma.financeImportBatch.count()).toBe(0);
    const key=randomUUID(),body={type:'CONFIRM_HISTORY_IMPORT',...input,previewToken:preview.previewToken!,reason:'Owner verifies bounded import.'};
    const saved=await command(body,key).expect(200),retry=await command(body,key).expect(200);expect(retry.body).toEqual(saved.body);
    const value=await get(root()).query(financePeriod).expect(200);expect(value.body.totals).toMatchObject({operatingCostMinor:900000,outstandingMinor:600000,registeredBalanceMinor:1000000});expect(await prisma.financeImportItem.count()).toBe(3);
    const fresh=(await post(`${root()}/v2/history-preview`,input).expect(200)).body as FinanceHistoryPreview;expect(fresh.sources.every(source=>source.status==='ALREADY_IMPORTED')).toBe(true);
    await command({...body,previewToken:fresh.previewToken!}).expect(200);expect(await prisma.financeExpense.count()).toBe(1);expect(await prisma.financeSettlement.count()).toBe(1);
    const audit=await prisma.financeAudit.findFirstOrThrow({where:{action:'FINANCE_V2.CONFIRM_HISTORY_IMPORT'}});expect(JSON.stringify(audit.details)).not.toContain(csv);expect(JSON.stringify(audit.details)).toContain('csvDigest');
  });
  it.each(['ADMIN','RECEPTIONIST','VIEWER']as const)('%s cannot access V2 operational data or replay an Owner command',async role=>{
    const body={type:'CREATE_EXPENSE_DRAFT',expenseDefinition:definition(),consumedOn:'2026-09-30',dueOn:null},key=randomUUID(),value=await command(body,key).expect(200),token=await realFinanceToken(app,fixture.users[role].id);
    await get(`${root()}/v2/drafts`,token).expect(403);await get(`${root()}/v2/drafts/${value.body.id as string}`,token).expect(403);await command(body,key,token).expect(403);expect(await prisma.financeExpenseDraft.count()).toBe(1);
  });
  it('masks foreign references and rejects numeric/sum/unknown-field inputs with no durable partial draft',async()=>{
    const foreign=definition();foreign.lines[0].resourceId=fixture.foreignResource.id;await draft(foreign).expect(404);
    const invalid=definition();invalid.lines[0].amountMinor--;await draft(invalid).expect(400);
    await command({type:'CREATE_EXPENSE_DRAFT',expenseDefinition:definition(),consumedOn:'2026-09-30',dueOn:null,actorUserId:fixture.foreignOwner.id}).expect(400);
    await get(`${root()}/v2/drafts/${randomUUID()}`).expect(404);expect(await prisma.financeExpenseDraft.count()).toBe(0);expect(await prisma.financeRequest.count()).toBe(0);
  });
  it('same-key retry survives response loss while a distinct concurrent stale editor gets409',async()=>{
    const value=await draft().expect(200),id=(value.body as FinanceV2Result).id;
    const edit={type:'EDIT_EXPENSE_DRAFT',id,expectedVersion:1,expenseDefinition:definition(700000),consumedOn:'2026-09-30',dueOn:null,reason:'Concurrent edit.'},key=randomUUID();
    const results=await Promise.all([command(edit,key),command(edit,key)]);expect(results.map(value=>value.status)).toEqual([200,200]);expect(results[0].body).toEqual(results[1].body);
    await command({...edit,expenseDefinition:definition(600000)}).expect(409);const detail=await get(`${root()}/v2/drafts/${id}`).expect(200);expect(detail.body.draft).toMatchObject({version:2,amountMinor:700000});expect(await prisma.financeExpenseDraftLine.count()).toBe(2);
  });
});
