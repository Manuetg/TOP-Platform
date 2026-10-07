import type { FinanceEvidenceStoragePort } from '../domain/finance-evidence-storage.port';
import { FinanceEvidenceUseCases } from '../application/finance-evidence.use-cases';
import { FinanceEvidencePrismaRepository } from './finance-evidence-prisma.repository';
import type { FinanceEvidenceCapabilities, FinanceEvidenceTransactionHost } from './finance-evidence-access';

/** Root binds the private provider and separate OWNER capabilities before mounting the controller. */
export function createFinanceEvidencePersistence(input: { host: FinanceEvidenceTransactionHost; storage: FinanceEvidenceStoragePort; capabilities: FinanceEvidenceCapabilities }): { repository: FinanceEvidencePrismaRepository; useCases: FinanceEvidenceUseCases } {
  const repository = new FinanceEvidencePrismaRepository(input.host, input.storage, input.capabilities);
  return { repository, useCases: new FinanceEvidenceUseCases(repository) };
}
