import type { ValidatedFinanceEvidenceFile } from '../domain/finance-evidence-file.rules';
import type { FinanceEvidenceActor, FinanceEvidenceListDto, FinanceEvidenceMetadataDto, FinanceEvidenceUploadResult } from '../domain/finance-evidence.types';

export const FINANCE_EVIDENCE_REPOSITORY = Symbol('FINANCE_EVIDENCE_REPOSITORY');
export interface FinanceEvidenceUploadInput extends FinanceEvidenceActor {
  expenseId: string;
  expectedVersion: number;
  idempotencyKey: string;
  fingerprint: string;
  file: ValidatedFinanceEvidenceFile;
}
export interface FinanceEvidenceDownload {
  metadata: FinanceEvidenceMetadataDto;
  bytes: Buffer;
}
export interface FinanceEvidenceRepositoryPort {
  list(actor: FinanceEvidenceActor, expenseId: string): Promise<FinanceEvidenceListDto>;
  upload(input: FinanceEvidenceUploadInput): Promise<FinanceEvidenceUploadResult>;
  download(actor: FinanceEvidenceActor, fileId: string): Promise<FinanceEvidenceDownload>;
}
