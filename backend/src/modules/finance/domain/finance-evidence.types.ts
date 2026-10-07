export const FINANCE_EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;
export type FinanceEvidenceMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

export interface FinanceEvidenceActor {
  businessId: string;
  actorUserId: string;
}

export interface FinanceEvidenceMetadataDto {
  id: string;
  businessId: string;
  expenseId: string;
  expenseVersion: number;
  filename: string;
  mimeType: FinanceEvidenceMimeType;
  sizeBytes: number;
  sha256: string;
  recordedByUserId: string;
  createdAt: string;
}

export interface FinanceExpenseEvidenceDto {
  enabled: boolean;
  retention: 'PRESERVE_WITHOUT_PURGE';
  fileSizeLimitBytes: typeof FINANCE_EVIDENCE_MAX_BYTES;
  allowedMimeTypes: readonly FinanceEvidenceMimeType[];
  files: readonly FinanceEvidenceMetadataDto[];
}

export type FinanceEvidenceListDto = FinanceExpenseEvidenceDto;

export interface FinanceEvidenceUploadResult {
  type: 'UPLOAD_FINANCE_EVIDENCE';
  id: string;
  version: number;
  file: FinanceEvidenceMetadataDto;
}

export interface FinanceEvidenceUploadCommand {
  expenseId: string;
  expectedVersion: number;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}
