import type { PaymentClosingSources } from '../../payment/payment.contract';
import { FinanceConflictError } from '../domain/finance.errors';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { financeReportCut } from './finance-v2-report.cut';
import { assertFinancePublicPaymentCurrentProvenance } from './finance-v2-payment.cut';

/** Reject mixed historical registered cash before invoking the unchanged canonical V1 mapper. */
export async function assertFinanceCashCut(tx:FinanceSqlTransaction,businessId:string,cut:string,source:PaymentClosingSources):Promise<void>{
  const normalizedCut=financeReportCut(cut),paymentIds=assertFinancePublicPaymentCurrentProvenance(businessId,normalizedCut,source);
  const result=await tx.query<{stale:boolean}>(`SELECT (
    EXISTS(SELECT 1 FROM "FinanceSettlement" s WHERE s."businessId"=$1 AND s."occurredAt"<=$2::timestamp AND s."createdAt">$2::timestamp)
    OR EXISTS(SELECT 1 FROM "FinanceTransfer" t WHERE t."businessId"=$1 AND t."occurredAt"<=$2::timestamp AND t."createdAt">$2::timestamp)
    OR EXISTS(SELECT 1 FROM "FinanceCashMovement" m WHERE m."businessId"=$1 AND m."occurredAt"<=$2::timestamp AND m."createdAt">$2::timestamp)
    OR EXISTS(SELECT 1 FROM "FinanceOpening" o WHERE o."businessId"=$1 AND o."occurredAt"<=$2::timestamp AND o."createdAt">$2::timestamp)
    OR EXISTS(SELECT 1 FROM "FinancePaymentLink" l WHERE l."businessId"=$1 AND l."paymentId"=ANY($3::text[]) AND l."createdAt">$2::timestamp)
    OR EXISTS(SELECT 1 FROM "FinanceAudit" a WHERE a."businessId"=$1 AND a."occurredAt">$2::timestamp AND (
      EXISTS(SELECT 1 FROM "FinanceSettlement" s WHERE s."businessId"=a."businessId" AND s.id=a."sourceId" AND s."occurredAt"<=$2::timestamp)
      OR EXISTS(SELECT 1 FROM "FinanceTransfer" t WHERE t."businessId"=a."businessId" AND t.id=a."sourceId" AND t."occurredAt"<=$2::timestamp)
      OR EXISTS(SELECT 1 FROM "FinanceCashMovement" m WHERE m."businessId"=a."businessId" AND m.id=a."sourceId" AND m."occurredAt"<=$2::timestamp)
      OR EXISTS(SELECT 1 FROM "FinanceOpening" o WHERE o."businessId"=a."businessId" AND (o.id=a."sourceId" OR o."accountId"=a."sourceId") AND o."occurredAt"<=$2::timestamp)
      OR EXISTS(SELECT 1 FROM "FinancePaymentLink" l WHERE l."businessId"=a."businessId" AND l."paymentId"=ANY($3::text[]) AND (l.id=a."sourceId" OR l."paymentId"=a."sourceId"))
    ))
  ) AS "stale"`,[businessId,normalizedCut,paymentIds]);
  if(result.length!==1||result[0].stale!==false)throw new FinanceConflictError('SOURCE_STALE');
}
