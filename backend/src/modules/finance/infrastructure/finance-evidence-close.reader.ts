import type { FinanceEvidenceMetadataDto } from '../domain/finance-evidence.types';
import { FinanceConflictError } from '../domain/finance.errors';
import { financeReportCut } from './finance-v2-report.cut';
import { planningDate } from '../application/finance-v2-planning.rules';
import type { FinanceEvidenceSqlTransaction } from './finance-evidence-access';

export interface FinanceEvidenceCloseSources {
  payload: { EVIDENCE_FILE: FinanceEvidenceMetadataDto[] };
  sourceRefs: { type: 'EVIDENCE_FILE'; id: string; version: string }[];
  guardSourceRefs: { type: 'EVIDENCE_FILE'; id: string; version: string }[];
  sourceCount: number;
  complete: true;
  missingSources: [];
}

/** Root authorizes OWNER and supplies the same close transaction. Only immutable metadata, never objects. */
export async function readFinanceEvidenceCloseSources(tx: FinanceEvidenceSqlTransaction, input: { businessId: string; from: string; to: string; asOf: string }): Promise<FinanceEvidenceCloseSources> {
  const cut = financeReportCut(input.asOf);
  if (planningDate(input.to) <= planningDate(input.from)) throw new FinanceConflictError('Intervalo de cierre inválido.');
  const rows = await tx.query<Omit<FinanceEvidenceMetadataDto, 'createdAt'> & { createdAt: Date }>('SELECT f.id,f."businessId",f."expenseId",f."expenseVersion",f.filename,f."mimeType",f."sizeBytes",f.sha256,f."recordedByUserId",f."createdAt" FROM "FinanceEvidenceFile" f JOIN "FinanceExpense" e ON e.id=f."expenseId" AND e."businessId"=f."businessId" WHERE f."businessId"=$1 AND f."createdAt"<=$4::timestamp AND e."consumedOn">=$2::date AND e."consumedOn"<$3::date ORDER BY f.id LIMIT 5001', [input.businessId, input.from, input.to, cut]);
  if (rows.length > 5000) throw new FinanceConflictError('FINANCE_CLOSE_SOURCE_LIMIT_EXCEEDED');
  const metadata = rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const refs = metadata.map(row => ({ type: 'EVIDENCE_FILE' as const, id: row.id, version: String(row.expenseVersion) }));
  return { payload: { EVIDENCE_FILE: metadata }, sourceRefs: refs, guardSourceRefs: refs, sourceCount: metadata.length, complete: true, missingSources: [] };
}
