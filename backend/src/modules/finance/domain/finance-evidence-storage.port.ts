import type { FinanceEvidenceMimeType } from './finance-evidence-file.rules';

export const FINANCE_EVIDENCE_STORAGE = Symbol('FINANCE_EVIDENCE_STORAGE');
export interface FinanceEvidenceUpload {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly mimeType: FinanceEvidenceMimeType;
  readonly sha256: string;
}
export interface FinanceEvidenceStoragePort {
  readonly enabled: boolean;
  upload(input: FinanceEvidenceUpload): Promise<void>;
  download(key: string): Promise<Buffer>;
  // Sólo compensación de un upload propio cuyo rollback fue comprobado. No purge
  // de archivos asociados; ante commit incierto se conserva hasta reconciliación.
  deleteOwned(key: string): Promise<void>;
}
