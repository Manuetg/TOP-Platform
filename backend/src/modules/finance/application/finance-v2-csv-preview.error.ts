import { FinanceInputError } from '../domain/finance.errors';
import type { FinancePreviewIssue, FinanceV2ErrorCode } from '../domain/finance-v2.types';
import type { EvidenceIssue } from './finance-v2-evidence.validation';

const PUBLIC_CODES:Readonly<Record<string,FinanceV2ErrorCode>>={MONEY_RANGE_INVALID:'MONEY_OVERFLOW',IMPORT_SOURCE_LIMIT:'SOURCE_LIMIT_EXCEEDED',CSV_ROW_LIMIT:'SOURCE_LIMIT_EXCEEDED',CSV_BYTE_LIMIT:'SOURCE_LIMIT_EXCEEDED',ACCOUNT_VERSION_STALE:'VERSION_CONFLICT',IMPORT_KEY_CONFLICT:'IMPORT_KEY_CONFLICT',BANK_IMPORT_KEY_CONFLICT:'IMPORT_KEY_CONFLICT',EXPENSE_APPROVAL_REQUIRED:'EXPENSE_APPROVAL_REQUIRED',REFERENCE_NOT_FOUND:'NOT_FOUND'};
/** HTTP400 only; this contains no successful digest, totals, sources or confirmation token. */
export class FinanceCsvPreviewError extends FinanceInputError {
  readonly previewToken=null;
  readonly issues:FinancePreviewIssue[];
  constructor(errors:readonly EvidenceIssue[]){
    super('El CSV contiene errores; revisa las filas indicadas.');
    this.issues=errors.map(error=>({ordinal:error.ordinal,column:error.column,code:PUBLIC_CODES[error.code]??'INVALID_INPUT',message:`${error.code}: ${error.column}`}));
  }
}
