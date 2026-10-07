import { createHash } from 'node:crypto';
import type { FinanceV2Actor,FinanceV2ReportQuery } from '../domain/finance-v2.types';
import { deriveFinanceAlerts,FinanceDerivedAlert,FinanceAlertServicePendingFact,FinanceAlertCashCountFact } from '../application/finance-v2-alerts.rules';
import { FinanceConflictError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import type { FinanceBankReadHost } from './finance-v2-bank.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { authorizeFinanceV2Read } from './finance-v2-operational.read-service';
import { bankLocalDate } from './finance-v2-bank-source.sql-reader';
import { sqlDate } from './finance-v2-draft.sql-store';
import { validateFinanceV2ReportQuery } from './finance-v2-cost.report-reader';
import { financeReportCut } from './finance-v2-report.cut';

export interface FinanceAlertServiceCoverageReader{pending(tx:FinanceSqlTransaction,input:FinanceV2ReportQuery&{businessId:string;timeZone:string}):Promise<{items:readonly FinanceAlertServicePendingFact[];token:string}>}
export interface FinanceAlertsReadResult{businessId:string;currency:'PYG';timeZone:string;from:string;to:string;asOf:string;today:string;token:string;basis:'CURRENT_OPERATIONS_AND_SERVICE_COVERAGE';items:FinanceDerivedAlert[]}
export class FinanceV2AlertsReadService{
  constructor(private readonly host:FinanceBankReadHost,private readonly serviceCoverage:FinanceAlertServiceCoverageReader){}
  read(actor:FinanceV2Actor,query:FinanceV2ReportQuery):Promise<FinanceAlertsReadResult>{
    validateFinanceV2ReportQuery(query);
    const cut=financeReportCut(query.asOf);
    return this.host.read(async tx=>{
      const business=await authorizeFinanceV2Read(tx,actor);const today=bankLocalDate(query.asOf,business.timeZone);
      const expenses=await tx.query<{id:string;version:number;description:string;amountMinor:bigint;paid:string;dueOn:Date|null;reference:string|null;hasEvidenceFile:boolean}>('SELECT e.id,e.version,e.description,e."amountMinor",e."dueOn",e.reference,EXISTS(SELECT 1 FROM "FinanceEvidenceFile" f WHERE f."businessId"=e."businessId" AND f."expenseId"=e.id AND f."createdAt"<=$2::timestamp) AS "hasEvidenceFile",COALESCE((SELECT SUM(s."amountMinor") FROM "FinanceSettlement" s WHERE s."businessId"=e."businessId" AND s."expenseId"=e.id),0)::text AS paid FROM "FinanceExpense" e WHERE e."businessId"=$1 ORDER BY e.id LIMIT 5001',[actor.businessId,cut]);
      const counts=await tx.query<Omit<FinanceAlertCashCountFact,'differenceMinor'>&{differenceMinor:bigint}>('SELECT DISTINCT ON ("accountId") id,"accountId",version,"differenceMinor","adjustmentId" FROM "FinanceCashCount" WHERE "businessId"=$1 AND "occurredAt"<=$2::timestamp ORDER BY "accountId","occurredAt" DESC,"createdAt" DESC,id DESC LIMIT 5001',[actor.businessId,cut]);
      const service=await this.serviceCoverage.pending(tx,{...query,businessId:actor.businessId,timeZone:business.timeZone});
      if(expenses.length+counts.length+service.items.length>5000)throw new FinanceConflictError('La consulta supera 5000 fuentes.');
      const items=deriveFinanceAlerts(today,{expenses:expenses.map(row=>({id:row.id,version:row.version,description:row.description,outstandingMinor:safeMoney(row.amountMinor-BigInt(row.paid)),dueOn:row.dueOn===null?null:sqlDate(row.dueOn),reference:row.reference,hasEvidenceFile:row.hasEvidenceFile})),cashCounts:counts.map(row=>({...row,differenceMinor:safeMoney(row.differenceMinor)})),pendingService:service.items});
      const token=createHash('sha256').update(JSON.stringify({businessId:actor.businessId,today,from:query.from,to:query.to,items,serviceToken:service.token})).digest('hex');
      return{businessId:actor.businessId,currency:'PYG',timeZone:business.timeZone,from:query.from,to:query.to,asOf:query.asOf,today,token,basis:'CURRENT_OPERATIONS_AND_SERVICE_COVERAGE',items};
    });
  }
}
