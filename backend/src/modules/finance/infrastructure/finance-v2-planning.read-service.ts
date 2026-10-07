import { createHash } from 'node:crypto';
import type { FinanceV2Actor, FinanceV2ReadRepository, FinanceAging, FinanceCashProjectionInput, FinanceCashProjection } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { safeMoney, sumMoney } from '../domain/finance-money';
import { parseFinanceUuid } from '../domain/finance-validation';
import { agingBucket, projectCashScenario, PlanningEvent } from '../application/finance-v2-planning.rules';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceBankReadHost } from './finance-v2-bank.read-service';
import { authorizeFinanceV2Read } from './finance-v2-operational.read-service';
import { bankLocalDate } from './finance-v2-bank-source.sql-reader';
import { sqlDate } from './finance-v2-draft.sql-store';
import type { FinanceReceivableEvidence } from '../application/finance-v2-receivable.rules';
import { financeReportCut } from './finance-v2-report.cut';
export type { FinanceReceivableEvidence, FinanceReceivableSource } from '../application/finance-v2-receivable.rules';

export interface FinancePlanningPublicReaders {
  /** Composition uses public Booking, classified Pricing and effective Payment/plan sources in this tx. */
  receivables(tx: FinanceSqlTransaction, businessId: string, asOf: string): Promise<FinanceReceivableEvidence>;
  /** Canonical Finance balance includes gross receipts and VOID/refund differentials exactly once. */
  cash(tx: FinanceSqlTransaction, businessId: string, asOf: string, accountIds: readonly string[]): Promise<{ balanceMinor: number | null; unknownAccountIds: string[]; token: string }>;
}
interface PayableRow { id: string; amountMinor: bigint; paid: string; dueOn: Date | null; version: number }
interface PendingCommitment { id: string; amountMinor: bigint; consumed: string; dueOn: Date | null; version: number }
const tokenOf=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function readFinanceV2Aging(tx: FinanceSqlTransaction,input:FinanceV2Actor&{asOf:string;timeZone:string},readers:FinancePlanningPublicReaders):Promise<FinanceAging> {
  const cut=financeReportCut(input.asOf),today=bankLocalDate(cut,input.timeZone);
  await assertFinancePlanningCut(tx,input.businessId,cut,today);
  const receivables=await readers.receivables(tx,input.businessId,cut);
  const payables=await tx.query<PayableRow>('SELECT e.id,e."amountMinor",e."dueOn",e.version,COALESCE((SELECT SUM(s."amountMinor") FROM "FinanceSettlement" s WHERE s."businessId"=e."businessId" AND s."expenseId"=e.id),0)::text AS paid FROM "FinanceExpense" e WHERE e."businessId"=$1 ORDER BY e.id LIMIT 5001',[input.businessId]);
  if (receivables.rows.length+payables.length>5000) throw new FinanceConflictError('La consulta supera 5000 fuentes.');
  const rows=[...payableAgingRows(payables,today),...receivableAgingRows(receivables.rows,today)];
  if(new Set(rows.map(row=>row.sourceKey)).size!==rows.length)throw new FinanceConflictError('La lectura repite una obligación.');
  sumMoney(rows.map(row=>row.amountMinor));
  for(const row of receivables.credits)if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<=0)throw new FinanceConflictError('Crédito no válido.');
  const token=tokenOf({businessId:input.businessId,today,rows,credits:receivables.credits,reviewBookingIds:receivables.reviewBookingIds,receivableToken:receivables.token});
  return{businessId:input.businessId,currency:'PYG',timeZone:input.timeZone,asOf:cut,today,token,basis:'CURRENT_OBLIGATIONS',unknownHistoricalDebt:true,rows,credits:[...receivables.credits],reviewBookingIds:[...receivables.reviewBookingIds]};
}

/** Current mutable obligations are usable only when their complete provenance fits the cut. */
async function assertFinancePlanningCut(tx:FinanceSqlTransaction,businessId:string,cut:string,localToday:string):Promise<void>{
  const rows=await tx.query<{stale:boolean}>(`SELECT (
    EXISTS(SELECT 1 FROM "FinanceExpense" e WHERE e."businessId"=$1 AND e."createdAt">$2::timestamp)
    OR EXISTS(SELECT 1 FROM "FinanceSettlement" s WHERE s."businessId"=$1 AND (s."createdAt">$2::timestamp OR s."occurredAt">$2::timestamp))
    OR EXISTS(SELECT 1 FROM "FinanceCommitment" c WHERE c."businessId"=$1 AND (c."createdAt">$2::timestamp OR c."cancelledAt">$2::timestamp))
    OR EXISTS(SELECT 1 FROM "FinanceCommitmentConversion" x LEFT JOIN "FinanceExpense" e ON e."businessId"=x."businessId" AND e.id=x."expenseId" WHERE x."businessId"=$1 AND (x."createdAt">$2::timestamp OR e.id IS NULL OR e."consumedOn">$3::date))
    OR EXISTS(SELECT 1 FROM "FinanceAudit" a WHERE a."businessId"=$1 AND a."occurredAt">$2::timestamp AND (
      EXISTS(SELECT 1 FROM "FinanceExpense" e WHERE e."businessId"=a."businessId" AND e.id=a."sourceId")
      OR EXISTS(SELECT 1 FROM "FinanceSettlement" s WHERE s."businessId"=a."businessId" AND s.id=a."sourceId")
      OR EXISTS(SELECT 1 FROM "FinanceCommitment" c WHERE c."businessId"=a."businessId" AND c.id=a."sourceId")
      OR EXISTS(SELECT 1 FROM "FinanceCommitmentConversion" x WHERE x."businessId"=a."businessId" AND x.id=a."sourceId")
    ))
  ) AS "stale"`,[businessId,cut,localToday]);
  if(rows.length!==1||rows[0].stale!==false)throw new FinanceConflictError('SOURCE_STALE');
}
function payableAgingRows(payables:readonly PayableRow[],today:string):FinanceAging['rows']{
  const rows:FinanceAging['rows']=[];
  for(const row of payables){
    const amountMinor=safeMoney(row.amountMinor-BigInt(row.paid));
    if(amountMinor<0)throw new FinanceConflictError('Una obligación tiene liquidaciones superiores al gasto.');
    if(amountMinor===0)continue;
    const dueOn=row.dueOn===null?null:sqlDate(row.dueOn);
    rows.push({direction:'PAYABLE',sourceKey:`EXPENSE:${row.id}`,bookingId:null,expenseId:row.id,amountMinor,dueOn,bucket:agingBucket(dueOn,today),sourceVersion:row.version});
  }
  return rows;
}
function receivableAgingRows(receivables:FinanceReceivableEvidence['rows'],today:string):FinanceAging['rows']{
  const rows:FinanceAging['rows']=[];
  for(const row of receivables){
    if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<=0||!Number.isSafeInteger(row.sourceVersion)||row.sourceVersion<1)throw new FinanceConflictError('Una fuente a cobrar es inválida.');
    rows.push({direction:'RECEIVABLE',sourceKey:row.sourceKey,bookingId:row.bookingId,expenseId:null,amountMinor:row.amountMinor,dueOn:row.dueOn,bucket:agingBucket(row.dueOn,today,row.needsReview),sourceVersion:row.sourceVersion});
  }
  return rows;
}

export class FinanceV2PlanningReadService implements Pick<FinanceV2ReadRepository,'aging'|'planningPreview'> {
  constructor(private readonly host:FinanceBankReadHost,private readonly readers:FinancePlanningPublicReaders){}
  aging(actor:FinanceV2Actor,asOf:string):Promise<FinanceAging>{return this.host.read(async tx=>{const business=await authorizeFinanceV2Read(tx,actor);return readFinanceV2Aging(tx,{...actor,asOf,timeZone:business.timeZone},this.readers);});}
  planningPreview(actor:FinanceV2Actor,input:FinanceCashProjectionInput):Promise<FinanceCashProjection>{
    return this.host.read(async tx=>{
      const business=await authorizeFinanceV2Read(tx,actor);
      if(!Array.isArray(input.accountIds)||input.accountIds.length<1||input.accountIds.length>100||new Set(input.accountIds).size!==input.accountIds.length)throw new FinanceInputError('Selecciona cuentas propias sin repetición.');
      input.accountIds.forEach(parseFinanceUuid);
      const aging=await readFinanceV2Aging(tx,{...actor,asOf:input.asOf,timeZone:business.timeZone},this.readers);
      const cash=await this.readers.cash(tx,actor.businessId,aging.asOf,input.accountIds);
      const commitments=await tx.query<PendingCommitment>('SELECT c.id,c."amountMinor",c."dueOn",c.version,COALESCE((SELECT SUM(x."consumedMinor") FROM "FinanceCommitmentConversion" x WHERE x."businessId"=c."businessId" AND x."commitmentId"=c.id),0)::text AS consumed FROM "FinanceCommitment" c WHERE c."businessId"=$1 AND c.state=\'ACTIVE\' ORDER BY c.id LIMIT 5001',[actor.businessId]);
      if(commitments.length>5000)throw new FinanceConflictError('La consulta supera 5000 fuentes.');
      const baseToken=tokenOf({businessId:actor.businessId,agingToken:aging.token,cashToken:cash.token,commitments:commitments.map(row=>({...row,amountMinor:safeMoney(row.amountMinor),consumed:safeMoney(BigInt(row.consumed)),dueOn:row.dueOn===null?null:sqlDate(row.dueOn)}))});
      if(input.baseToken!==''&&input.baseToken!==baseToken)throw new FinanceConflictError('PROJECTION_BASE_STALE');
      const sources=projectionSources(aging,commitments);
      const events=projectionEvents(input,sources);
      const projection=projectCashScenario(cash.balanceMinor,events,aging.today,input.horizonTo);
      const excludedSourceKeys=validateExcluded(input.excludedSourceKeys,sources);
      const scenarioToken=tokenOf({baseToken,input,events:projection.events});
      return{...projection,businessId:actor.businessId,currency:'PYG',timeZone:business.timeZone,asOf:aging.asOf,token:baseToken,scenarioToken,sources:sources.map(source=>({sourceKey:source.sourceKey,origin:source.origin,direction:source.direction,amountMinor:source.amountMinor,expectedOn:source.expectedOn,accountId:null,reviewRequired:source.review})),events:projection.events.map(event=>({sourceKey:event.sourceKey,origin:event.origin,amountMinor:event.direction==='OUT'?-event.amountMinor:event.amountMinor,expectedOn:event.expectedOn,probabilityBasisPoints:event.probabilityBasisPoints,weightedAmountMinor:event.direction==='OUT'?-event.weightedAmountMinor:event.weightedAmountMinor,accountId:event.accountId,reason:event.reason})),coverage:{unknownAccountIds:cash.unknownAccountIds,unassignedSourceKeys:events.filter(event=>event.accountId===null).map(event=>event.sourceKey),undatedSourceKeys:sources.filter(source=>source.expectedOn===null).map(source=>source.sourceKey),reviewBookingIds:aging.reviewBookingIds,excludedSourceKeys}};
    });
  }
}
interface ScenarioSource {sourceKey:string;origin:'RECEIVABLE'|'PAYABLE'|'COMMITMENT';direction:'IN'|'OUT';amountMinor:number;expectedOn:string|null;review:boolean}
function projectionSources(aging:FinanceAging,commitments:readonly PendingCommitment[]):ScenarioSource[]{
  const sources:ScenarioSource[]=aging.rows.map(row=>({sourceKey:row.sourceKey,origin:row.direction==='PAYABLE'?'PAYABLE':'RECEIVABLE',direction:row.direction==='PAYABLE'?'OUT':'IN',amountMinor:row.amountMinor,expectedOn:row.dueOn,review:row.bucket==='REVIEW'}));
  for(const row of commitments){const pending=safeMoney(row.amountMinor-BigInt(row.consumed));if(pending<0)throw new FinanceConflictError('Compromiso consumido en exceso.');if(pending>0)sources.push({sourceKey:`COMMITMENT:${row.id}`,origin:'COMMITMENT',direction:'OUT',amountMinor:pending,expectedOn:row.dueOn===null?null:sqlDate(row.dueOn),review:false});}
  if(sources.length>5000)throw new FinanceConflictError('La consulta supera 5000 fuentes.');
  if(new Set(sources.map(source=>source.sourceKey)).size!==sources.length)throw new FinanceConflictError('La lectura repite una fuente de planificación.');
  return sources;
}
function validateExcluded(excluded:readonly string[],sources:readonly ScenarioSource[]):string[]{
  if(!isScenarioArray(excluded)||excluded.length>5000||new Set(excluded).size!==excluded.length||excluded.some(key=>!sources.some(source=>source.sourceKey===key)))throw new FinanceInputError('Exclusiones de escenario inválidas.');return[...excluded];
}
function isScenarioArray(value:unknown):boolean{return Array.isArray(value);}
function projectionEvents(input:FinanceCashProjectionInput,sources:readonly ScenarioSource[]):PlanningEvent[]{
  validateExcluded(input.excludedSourceKeys,sources);
  if(!Array.isArray(input.events)||input.events.length>200)throw new FinanceInputError('Escenario acotado requerido.');
  return input.events.map((event,index)=>{
    if(event.accountId!==null&&!input.accountIds.includes(event.accountId))throw new FinanceInputError('Cuenta de escenario fuera de selección.');
    if(event.sourceKey!==null){
      const source=sources.find(row=>row.sourceKey===event.sourceKey);
      if(!source||source.review||input.excludedSourceKeys.includes(event.sourceKey)||source.direction!==event.direction||event.amountMinor>source.amountMinor)throw new FinanceConflictError('La fuente del escenario no permite ese flujo.');
      return{...event,sourceKey:source.sourceKey,origin:source.origin};
    }
    return{...event,sourceKey:`MANUAL:${index}`,origin:'MANUAL' as const};
  });
}
