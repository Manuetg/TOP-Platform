import { createHash } from 'node:crypto';
import { FinancialFileInputError, validateFinanceEvidenceFile, type FinanceEvidenceFileInput } from '../domain/finance-evidence-file.rules';
import { parseFinanceUuid } from '../domain/finance-validation';
import type { FinanceEvidenceActor } from '../domain/finance-evidence.types';
import type { FinanceEvidenceUploadInput } from './finance-evidence.repository.port';

function expectedVersion(body: unknown): number {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'expectedVersion') throw new FinancialFileInputError('Se requiere únicamente expectedVersion.');
  const value = (body as { expectedVersion: unknown }).expectedVersion;
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) throw new FinancialFileInputError('La versión debe ser un entero positivo.');
  const version = Number(value);
  if (version >= 2147483647) throw new FinancialFileInputError('La versión queda fuera del rango admitido.');
  return version;
}

export function parseFinanceEvidenceUpload(actor: FinanceEvidenceActor, expenseId: unknown, body: unknown, key: unknown, input: FinanceEvidenceFileInput): FinanceEvidenceUploadInput {
  const trustedActor = { businessId: parseFinanceUuid(actor.businessId), actorUserId: parseFinanceUuid(actor.actorUserId) };
  const id = parseFinanceUuid(expenseId);
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{16,128}$/.test(key)) throw new FinancialFileInputError('Idempotency-Key inválida.');
  const version = expectedVersion(body);
  const file = validateFinanceEvidenceFile(input);
  const fingerprint = createHash('sha256').update(JSON.stringify({ type: 'UPLOAD_FINANCE_EVIDENCE', expenseId: id, expectedVersion: version, filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256 })).digest('hex');
  return { ...trustedActor, expenseId: id, expectedVersion: version, idempotencyKey: key, fingerprint, file };
}
