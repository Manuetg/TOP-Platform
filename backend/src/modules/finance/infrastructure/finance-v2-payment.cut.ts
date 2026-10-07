import type { PaymentClosingSources } from '../../payment/payment.contract';
import { FinanceConflictError } from '../domain/finance.errors';
import { financeReportCut } from './finance-v2-report.cut';

type CashPayment={id:string;paidAt:number;createdAt:number};
function stale():never{throw new FinanceConflictError('SOURCE_STALE');}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return stale();return value as Record<string,unknown>;}
function rows(value:unknown):Record<string,unknown>[] {if(!Array.isArray(value)||value.length>5000)return stale();return value.map(record);}
function instant(value:unknown):number {if(typeof value!=='string')return stale();try{return Date.parse(financeReportCut(value));}catch{return stale();}}
function identifier(value:unknown):string {if(typeof value!=='string'||!value)return stale();return value;}

/** Shared by cash and obligations; current Payment provenance comes only from its public closing port. */
export function assertFinancePublicPaymentCurrentProvenance(businessId:string,asOf:string,source:PaymentClosingSources):string[]{
  const cut=Date.parse(financeReportCut(asOf));
  if(!source.complete)return stale();const payload=record(source.payload),payments=rows(payload.payments),adjustments=rows(payload.adjustments);
  const originals=new Map<string,CashPayment>();
  for(const row of payments)addCashPayment(originals,row,businessId,cut);
  for(const row of adjustments)assertCashAdjustment(originals,row,businessId,cut);
  return [...originals.values()].filter(row=>row.paidAt<=cut).map(row=>row.id);
}
function addCashPayment(originals:Map<string,CashPayment>,row:Record<string,unknown>,businessId:string,cut:number):void{
  if(row.businessId!==businessId)return stale();const id=identifier(row.id),paidAt=instant(row.paidAt),createdAt=instant(row.createdAt);
  if(originals.has(id)||(paidAt<=cut&&createdAt>cut)||(createdAt<=cut&&paidAt>cut))return stale();originals.set(id,{id,paidAt,createdAt});
}
function assertCashAdjustment(originals:ReadonlyMap<string,CashPayment>,row:Record<string,unknown>,businessId:string,cut:number):void{
  const original=originals.get(identifier(row.paymentId));if(row.businessId!==businessId||!original)return stale();
  if(row.kind!=='VOID'&&row.kind!=='REFUND')return stale();const effectiveAt=row.kind==='VOID'?original.paidAt:instant(row.occurredAt);
  const createdAt=instant(row.createdAt);
  if((effectiveAt<=cut&&createdAt>cut)||(createdAt<=cut&&effectiveAt>cut))return stale();
}
