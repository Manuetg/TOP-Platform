import { ApiError } from '../../../shared/api/api-client';
import type { FinancePreviewIssue, FinanceV2ErrorCode } from './finance-v2.types';

const codes: readonly FinanceV2ErrorCode[] = ['INVALID_INPUT', 'NOT_AUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'PREVIEW_STALE', 'SOURCE_STALE', 'SOURCE_LIMIT_EXCEEDED', 'EXPENSE_APPROVAL_REQUIRED', 'DIFFERENT_APPROVER_REQUIRED', 'INVALID_DRAFT_STATE', 'IMPORT_KEY_CONFLICT', 'BANK_MATCH_CAPACITY_EXCEEDED', 'COMMITMENT_CAPACITY_EXCEEDED', 'MONEY_OVERFLOW'];
export function financePreviewIssues(error: unknown): FinancePreviewIssue[] {
  if (!(error instanceof ApiError) || error.status !== 400 || !error.previewIssues?.length ||
    error.previewIssues.some((issue) => !codes.includes(issue.code as FinanceV2ErrorCode))) return [];
  return error.previewIssues.map((issue) => ({ ...issue, code: issue.code as FinanceV2ErrorCode }));
}
export function FinancePreviewIssues({ issues }: { issues: readonly FinancePreviewIssue[] }) {
  return issues.length ? <div className="finance-v2-preview" aria-label="Errores del archivo CSV">{issues.map((issue, index) => <p role="alert" key={`${issue.ordinal}:${issue.column}:${issue.code}:${index}`}>{issue.ordinal === 0 ? 'Archivo' : `Fila ${issue.ordinal}`}{issue.column ? `, ${issue.column}` : ''}: {issue.message}</p>)}</div> : null;
}
