import type { FinanceEvidenceActor, FinanceEvidenceListDto, FinanceEvidenceUploadResult } from '../domain/finance-evidence.types';
import type { FinanceEvidenceFileInput } from '../domain/finance-evidence-file.rules';
import { parseFinanceUuid } from '../domain/finance-validation';
import type { FinanceEvidenceDownload, FinanceEvidenceRepositoryPort } from './finance-evidence.repository.port';
import { parseFinanceEvidenceUpload } from './finance-evidence-upload.parser';

export class FinanceEvidenceUseCases {
  constructor(private readonly repository: FinanceEvidenceRepositoryPort) {}

  list(actor: FinanceEvidenceActor, expenseId: unknown): Promise<FinanceEvidenceListDto> {
    return this.repository.list(validActor(actor), parseFinanceUuid(expenseId));
  }

  upload(actor: FinanceEvidenceActor, expenseId: unknown, body: unknown, key: unknown, file: FinanceEvidenceFileInput): Promise<FinanceEvidenceUploadResult> {
    return this.repository.upload(parseFinanceEvidenceUpload(actor, expenseId, body, key, file));
  }

  download(actor: FinanceEvidenceActor, fileId: unknown): Promise<FinanceEvidenceDownload> {
    return this.repository.download(validActor(actor), parseFinanceUuid(fileId));
  }
}

function validActor(actor: FinanceEvidenceActor): FinanceEvidenceActor {
  return { businessId: parseFinanceUuid(actor.businessId), actorUserId: parseFinanceUuid(actor.actorUserId) };
}
