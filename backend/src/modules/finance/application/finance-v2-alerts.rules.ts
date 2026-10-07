import { createHash } from 'node:crypto';
import { FinanceConflictError } from '../domain/finance.errors';
import { planningDate } from './finance-v2-planning.rules';

export type FinanceAlertKind='OVERDUE_PAYABLE'|'MISSING_EXPENSE_EVIDENCE'|'PENDING_SERVICE_EVIDENCE'|'UNRESOLVED_CASH_DIFFERENCE';
export type FinanceAlertTarget={type:'EXPENSE';id:string}|{type:'SERVICE_NIGHT';bookingId:string;localNight:string}|{type:'CASH_COUNT';id:string;accountId:string};
export interface FinanceDerivedAlert{id:string;kind:FinanceAlertKind;sourceId:string;sourceVersion:string;severity:'ACTION'|'REVIEW';title:string;description:string;amountMinor:number|null;target:FinanceAlertTarget}
export interface FinanceAlertExpenseFact{id:string;version:number;description:string;outstandingMinor:number;dueOn:string|null;reference:string|null;hasEvidenceFile:boolean}
export interface FinanceAlertCashCountFact{id:string;accountId:string;version:number;differenceMinor:number;adjustmentId:string|null}
export interface FinanceAlertServicePendingFact{sourceId:string;sourceVersion:string;bookingId:string;localNight:string;reason:string}

/** Only current facts determine presence; there is no invented acknowledgement/resolved record. */
export function deriveFinanceAlerts(today:string,input:{expenses:readonly FinanceAlertExpenseFact[];cashCounts:readonly FinanceAlertCashCountFact[];pendingService:readonly FinanceAlertServicePendingFact[]}):FinanceDerivedAlert[]{
  const day=planningDate(today);const alerts:FinanceDerivedAlert[]=[];
  for(const expense of input.expenses)alerts.push(...expenseAlerts(day,expense));
  for(const count of input.cashCounts)if(count.differenceMinor!==0&&count.adjustmentId===null){requireSafe(count.differenceMinor);alerts.push(alert('UNRESOLVED_CASH_DIFFERENCE',count.id,String(count.version),'ACTION','Diferencia de caja pendiente','El conteo registrado tiene una diferencia sin ajuste enlazado.',count.differenceMinor,{type:'CASH_COUNT',id:count.id,accountId:count.accountId}));}
  for(const source of input.pendingService)if(planningDate(source.localNight)<day)alerts.push(alert('PENDING_SERVICE_EVIDENCE',source.sourceId,source.sourceVersion,'REVIEW','Servicio pendiente de evidencia',source.reason,null,{type:'SERVICE_NIGHT',bookingId:source.bookingId,localNight:source.localNight}));
  if(alerts.length>5000||new Set(alerts.map(row=>row.id)).size!==alerts.length)throw new FinanceConflictError('FINANCE_ALERT_SOURCE_LIMIT_OR_DUPLICATE');
  return alerts.sort((left,right)=>left.kind.localeCompare(right.kind)||left.id.localeCompare(right.id));
}
function expenseAlerts(day:number,expense:FinanceAlertExpenseFact):FinanceDerivedAlert[]{
  requireSafe(expense.outstandingMinor);if(expense.outstandingMinor<0)throw new FinanceConflictError('Obligación negativa inválida.');
  const rows:FinanceDerivedAlert[]=[];const target:FinanceAlertTarget={type:'EXPENSE',id:expense.id};const version=String(expense.version);
  if(expense.outstandingMinor>0&&expense.dueOn!==null&&planningDate(expense.dueOn)<day)rows.push(alert('OVERDUE_PAYABLE',expense.id,version,'ACTION','Cuenta por pagar vencida',expense.description,expense.outstandingMinor,target));
  if((expense.reference===null||!expense.reference.trim())&&!expense.hasEvidenceFile)rows.push(alert('MISSING_EXPENSE_EVIDENCE',expense.id,version,'REVIEW','Gasto sin evidencia',expense.description,null,target));
  return rows;
}
function alert(kind:FinanceAlertKind,sourceId:string,sourceVersion:string,severity:FinanceDerivedAlert['severity'],title:string,description:string,amountMinor:number|null,target:FinanceAlertTarget):FinanceDerivedAlert{
  if(!sourceId||!sourceVersion)throw new FinanceConflictError('Alerta sin procedencia estable.');
  const id=createHash('sha256').update(`${kind}:${sourceId}:${sourceVersion}`).digest('hex');
  return{id,kind,sourceId,sourceVersion,severity,title,description,amountMinor,target};
}
function requireSafe(value:number):void{if(!Number.isSafeInteger(value))throw new FinanceConflictError('Importe de alerta PYG inválido.');}
