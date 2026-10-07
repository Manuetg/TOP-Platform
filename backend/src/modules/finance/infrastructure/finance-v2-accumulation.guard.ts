import { safeMoney } from '../domain/finance-money';
import type { FinanceSqlTransaction } from './finance-v2.repository';

const MONEY_COLUMNS = [
  ['FinanceExpenseDraft','amountMinor'],['FinanceExpenseDraftLine','amountMinor'],['FinanceExpenseTemplateRevision','amountMinor'],['FinanceExpenseTemplateLine','amountMinor'],
  ['FinanceBankRow','amountMinor'],['FinanceBankMatchRow','consumedAmountMinor'],['FinanceBankMatchComponent','amountMinor'],
  ['FinanceCostAllocation','sourceAmountMinor'],['FinanceCostAllocation','unassignedMinor'],['FinanceCostAllocationPart','amountMinor'],
  ['FinanceLaborCostRevision','estimatedMinor'],['FinanceBudgetLine','approvedMinor'],['FinanceCommitment','amountMinor'],['FinanceCommitmentConversion','consumedMinor'],
] as const;
/** Facts/revision values are bounded individually; only selected sources enter current totals. */
export async function guardFinanceV2Accumulations(tx:FinanceSqlTransaction,businessId:string,baselineAndPaymentPublicGuard:(tx:FinanceSqlTransaction,businessId:string)=>Promise<void>):Promise<void>{
  await baselineAndPaymentPublicGuard(tx,businessId);
  for(const[table,column]of MONEY_COLUMNS){
    const rows=await tx.query<{total:string}>(`SELECT COALESCE(MAX(ABS("${column}")),0)::text AS total FROM "${table}" WHERE "businessId"=$1`,[businessId]);
    safeMoney(BigInt(rows[0]?.total??'0'));
  }
  const current=await tx.query<{actual:string;estimated:string;owner:string;pending:string}>('WITH selected AS (SELECT DISTINCT ON (l.id) l.id,l.kind,r."actualExpenseLineId",r."estimatedMinor" FROM "FinanceLaborCost" l JOIN "FinanceLaborCostRevision" r ON r."laborId"=l.id AND r."businessId"=l."businessId" WHERE l."businessId"=$1 ORDER BY l.id,r."revisionNo" DESC) SELECT COALESCE((SELECT SUM("amountMinor") FROM "FinanceExpenseLine" WHERE "businessId"=$1 AND operational=true),0)::text AS actual,COALESCE((SELECT SUM("estimatedMinor") FROM selected WHERE kind=\'PRECOMPUTED_LABOR\' AND "actualExpenseLineId" IS NULL),0)::text AS estimated,COALESCE((SELECT SUM("estimatedMinor") FROM selected WHERE kind=\'OWNER_IMPUTED\' AND "actualExpenseLineId" IS NULL),0)::text AS owner,COALESCE((SELECT SUM(c."amountMinor"-COALESCE((SELECT SUM(x."consumedMinor") FROM "FinanceCommitmentConversion" x WHERE x."businessId"=c."businessId" AND x."commitmentId"=c.id),0)) FROM "FinanceCommitment" c WHERE c."businessId"=$1 AND c.state=\'ACTIVE\'),0)::text AS pending',[businessId]);
  if(!current[0])throw new Error('FINANCE_TOTALS_UNAVAILABLE');
  const actual=BigInt(current[0].actual);const estimate=BigInt(current[0].estimated);const owner=BigInt(current[0].owner);
  for(const value of[actual,estimate,owner,actual+estimate,actual+estimate+owner,BigInt(current[0].pending)])safeMoney(value);
}
