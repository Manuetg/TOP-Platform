import { randomUUID } from 'node:crypto';
import type { FinanceEvidenceActor, FinanceEvidenceListDto, FinanceEvidenceMetadataDto, FinanceEvidenceUploadResult } from '../domain/finance-evidence.types';
import type { FinanceEvidenceStoragePort } from '../domain/finance-evidence-storage.port';
import { assertFinanceEvidenceIntegrity, financeEvidenceStorageKey, FinancialFileIntegrityError, FinancialFileUnavailableError, FINANCE_EVIDENCE_MIME_TYPES, MAX_FINANCE_EVIDENCE_BYTES, validateFinanceEvidenceFile } from '../domain/finance-evidence-file.rules';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import type { FinanceEvidenceDownload, FinanceEvidenceRepositoryPort, FinanceEvidenceUploadInput } from '../application/finance-evidence.repository.port';
import { authorizeFinanceEvidence, requireFinanceEvidenceActiveBusiness, type FinanceEvidenceCapabilities, type FinanceEvidenceSqlTransaction, type FinanceEvidenceTransactionHost } from './finance-evidence-access';

interface FileRow extends Omit<FinanceEvidenceMetadataDto, 'createdAt'> { createdAt: Date; storageKey: string }
interface UploadAttempt { key: string | null; uploaded: boolean; callbackFailed: boolean; callbackFailure: unknown; callbackCompleted: boolean }
const FILE_SELECT = 'f.id,f."businessId",f."expenseId",f."expenseVersion",f.filename,f."mimeType",f."sizeBytes",f.sha256,f."recordedByUserId",f."createdAt",f."storageKey"';
const OPERATION = 'UPLOAD_FINANCE_EVIDENCE';

export class FinanceEvidencePrismaRepository implements FinanceEvidenceRepositoryPort {
  constructor(private readonly host: FinanceEvidenceTransactionHost, private readonly storage: FinanceEvidenceStoragePort, private readonly capabilities: FinanceEvidenceCapabilities) {}

  list(actor: FinanceEvidenceActor, expenseId: string): Promise<FinanceEvidenceListDto> {
    return this.host.read(async tx => {
      await authorizeFinanceEvidence(tx, actor, 'READ', this.capabilities);
      await findExpense(tx, actor.businessId, expenseId);
      const rows = await tx.query<FileRow>(`SELECT ${FILE_SELECT} FROM "FinanceEvidenceFile" f WHERE f."businessId"=$1 AND f."expenseId"=$2 ORDER BY f.id LIMIT 5001`, [actor.businessId, expenseId]);
      requireFileLimit(rows.length);
      return { enabled: this.storage.enabled, retention: 'PRESERVE_WITHOUT_PURGE', fileSizeLimitBytes: MAX_FINANCE_EVIDENCE_BYTES, allowedMimeTypes: [...FINANCE_EVIDENCE_MIME_TYPES], files: rows.map(metadata) };
    });
  }

  async upload(input: FinanceEvidenceUploadInput): Promise<FinanceEvidenceUploadResult> {
    const attempt: UploadAttempt = { key: null, uploaded: false, callbackFailed: false, callbackFailure: undefined, callbackCompleted: false };
    try {
      return await this.host.transaction(async tx => {
        try {
          const result = await this.uploadWithinTransaction(tx, input, attempt);
          attempt.callbackCompleted = true;
          return result;
        } catch (error) {
          attempt.callbackFailed = true;
          attempt.callbackFailure = error;
          throw error;
        }
      });
    } catch (error) {
      await this.compensateKnownRollback(attempt, error);
      throw error;
    }
  }

  private async uploadWithinTransaction(tx: FinanceEvidenceSqlTransaction, input: FinanceEvidenceUploadInput, attempt: UploadAttempt): Promise<FinanceEvidenceUploadResult> {
    const business = await authorizeFinanceEvidence(tx, input, 'WRITE', this.capabilities);
    const prior = await readReplay(tx, input);
    if (prior) return prior;
    requireFinanceEvidenceActiveBusiness(business);
    if (!this.storage.enabled) throw new FinancialFileUnavailableError('El almacenamiento privado no está disponible.');
    const expense = await findExpense(tx, input.businessId, input.expenseId);
    if (expense.version !== input.expectedVersion) throw new FinanceConflictError('La versión del gasto cambió; actualiza antes de adjuntar.');
    const fileId = randomUUID();
    const requestId = randomUUID();
    attempt.key = financeEvidenceStorageKey(input.businessId, input.expenseId, fileId);
    await this.storage.upload({ key: attempt.key, bytes: input.file.bytes, mimeType: input.file.mimeType, sha256: input.file.sha256 });
    attempt.uploaded = true;
    await advanceExpenseVersion(tx, input);
    const recordedAt = await serverRecordedAt(tx);
    const result = uploadResult(input, fileId, recordedAt);
    // Request is append-only: its final metadata and the File use one server timestamp.
    await insertRequest(tx, input, requestId, result);
    const file = await insertFile(tx, input, fileId, requestId, attempt.key, recordedAt);
    if (JSON.stringify(file) !== JSON.stringify(result.file)) throw new FinancialFileIntegrityError('La metadata confirmada no coincide con la solicitud inmutable.');
    await insertAudit(tx, input, result);
    return result;
  }

  private async compensateKnownRollback(attempt: UploadAttempt, error: unknown): Promise<void> {
    if (!attempt.uploaded || attempt.key === null || attempt.callbackCompleted || !attempt.callbackFailed || error !== attempt.callbackFailure) return;
    // Only callback rejection propagated by the transaction host proves COMMIT was never requested.
    // A commit/connection error after callback completion preserves the object for reconciliation.
    try { await this.storage.deleteOwned(attempt.key); } catch { /* Retain object and original failure; no automatic purge. */ }
  }

  async download(actor: FinanceEvidenceActor, fileId: string): Promise<FinanceEvidenceDownload> {
    const file = await this.host.read(async tx => {
      await authorizeFinanceEvidence(tx, actor, 'READ', this.capabilities);
      return findFile(tx, actor.businessId, fileId);
    });
    const expectedKey = financeEvidenceStorageKey(actor.businessId, file.expenseId, file.id);
    if (file.storageKey !== expectedKey) throw new FinancialFileIntegrityError('La procedencia del archivo privado no coincide.');
    const bytes = await this.storage.download(expectedKey);
    assertFinanceEvidenceIntegrity(bytes, file);
    validateFinanceEvidenceFile({ filename: file.filename, mimeType: file.mimeType, bytes });
    return { metadata: metadata(file), bytes };
  }

  /** Internal restore check on an explicitly supplied restored host/provider; no purge or public route. */
  async verifyRestoredFiles(actor: FinanceEvidenceActor): Promise<{ verifiedFileIds: string[]; hashes: { id: string; sha256: string }[] }> {
    const ids = await this.host.read(async tx => {
      await authorizeFinanceEvidence(tx, actor, 'READ', this.capabilities);
      const rows = await tx.query<{ id: string }>('SELECT id FROM "FinanceEvidenceFile" WHERE "businessId"=$1 ORDER BY id LIMIT 5001', [actor.businessId]);
      requireFileLimit(rows.length);
      return rows.map(row => row.id);
    });
    const hashes: { id: string; sha256: string }[] = [];
    for (const id of ids) {
      const file = await this.download(actor, id);
      hashes.push({ id: file.metadata.id, sha256: file.metadata.sha256 });
    }
    return { verifiedFileIds: ids, hashes };
  }
}

function requireFileLimit(length: number): void {
  if (length > 5000) throw new FinanceConflictError('La consulta supera 5000 archivos; no se devuelve un conjunto truncado.');
}

async function findExpense(tx: FinanceEvidenceSqlTransaction, businessId: string, expenseId: string): Promise<{ version: number }> {
  const rows = await tx.query<{ version: number }>('SELECT version FROM "FinanceExpense" WHERE "businessId"=$1 AND id=$2', [businessId, expenseId]);
  if (!rows[0]) throw new FinanceNotFoundError('Gasto no disponible.');
  return rows[0];
}

async function findFile(tx: FinanceEvidenceSqlTransaction, businessId: string, id: string): Promise<FileRow> {
  const rows = await tx.query<FileRow>(`SELECT ${FILE_SELECT} FROM "FinanceEvidenceFile" f JOIN "FinanceExpense" e ON e.id=f."expenseId" AND e."businessId"=f."businessId" JOIN "FinanceRequest" r ON r.id=f."requestId" AND r."businessId"=f."businessId" WHERE f."businessId"=$1 AND f.id=$2 AND r.operation=$3`, [businessId, id, OPERATION]);
  if (!rows[0]) throw new FinanceNotFoundError('Archivo no disponible.');
  return rows[0];
}

async function readReplay(tx: FinanceEvidenceSqlTransaction, input: FinanceEvidenceUploadInput): Promise<FinanceEvidenceUploadResult | null> {
  const rows = await tx.query<{ fingerprint: string; result: FinanceEvidenceUploadResult }>('SELECT fingerprint,result FROM "FinanceRequest" WHERE "businessId"=$1 AND operation=$2 AND "idempotencyKey"=$3', [input.businessId, OPERATION, input.idempotencyKey]);
  if (!rows[0]) return null;
  if (rows[0].fingerprint !== input.fingerprint) throw new FinanceConflictError('La clave de reintento pertenece a otro archivo o intención.');
  const result = rows[0].result;
  if (result.file.businessId !== input.businessId || result.file.expenseId !== input.expenseId || result.file.sha256 !== input.file.sha256 || result.id !== result.file.id) throw new FinancialFileIntegrityError('La solicitud guardada no coincide con el archivo.');
  return result;
}

async function advanceExpenseVersion(tx: FinanceEvidenceSqlTransaction, input: FinanceEvidenceUploadInput): Promise<void> {
  const changed = await tx.execute('UPDATE "FinanceExpense" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, input.expenseId, input.expectedVersion]);
  if (changed !== 1) throw new FinanceConflictError('La versión del gasto cambió; actualiza antes de adjuntar.');
}

function uploadResult(input: FinanceEvidenceUploadInput, id: string, createdAt: Date): FinanceEvidenceUploadResult {
  return { type: OPERATION, id, version: input.expectedVersion + 1, file: { id, businessId: input.businessId, expenseId: input.expenseId, expenseVersion: input.expectedVersion + 1, filename: input.file.filename, mimeType: input.file.mimeType, sizeBytes: input.file.sizeBytes, sha256: input.file.sha256, recordedByUserId: input.actorUserId, createdAt: createdAt.toISOString() } };
}

async function insertRequest(tx: FinanceEvidenceSqlTransaction, input: FinanceEvidenceUploadInput, requestId: string, result: FinanceEvidenceUploadResult): Promise<void> {
  await tx.execute('INSERT INTO "FinanceRequest" (id,"businessId",operation,"idempotencyKey",fingerprint,result,"createdAt") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamp)', [requestId, input.businessId, OPERATION, input.idempotencyKey, input.fingerprint, JSON.stringify(result), result.file.createdAt]);
}

async function serverRecordedAt(tx: FinanceEvidenceSqlTransaction): Promise<Date> {
  const rows = await tx.query<{ recordedAt: Date }>(`SELECT date_trunc('milliseconds', clock_timestamp()) AS "recordedAt"`, []);
  if (rows.length !== 1 || !(rows[0].recordedAt instanceof Date) || !Number.isFinite(rows[0].recordedAt.getTime())) throw new FinancialFileIntegrityError('No se confirmó el instante del archivo.');
  return rows[0].recordedAt;
}

async function insertFile(tx: FinanceEvidenceSqlTransaction, input: FinanceEvidenceUploadInput, id: string, requestId: string, key: string, recordedAt: Date): Promise<FinanceEvidenceMetadataDto> {
  const rows = await tx.query<FileRow>('INSERT INTO "FinanceEvidenceFile" (id,"businessId","expenseId","requestId","recordedByUserId","expenseVersion",filename,"mimeType","sizeBytes",sha256,"storageKey","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamp) RETURNING *', [id, input.businessId, input.expenseId, requestId, input.actorUserId, input.expectedVersion + 1, input.file.filename, input.file.mimeType, input.file.sizeBytes, input.file.sha256, key, recordedAt.toISOString()]);
  if (!rows[0]) throw new FinancialFileIntegrityError('No se confirmó la metadata del archivo.');
  return metadata(rows[0]);
}

function metadata(row: FileRow): FinanceEvidenceMetadataDto {
  return { id: row.id, businessId: row.businessId, expenseId: row.expenseId, expenseVersion: row.expenseVersion, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes, sha256: row.sha256, recordedByUserId: row.recordedByUserId, createdAt: row.createdAt.toISOString() };
}

async function insertAudit(tx: FinanceEvidenceSqlTransaction, input: FinanceEvidenceUploadInput, result: FinanceEvidenceUploadResult): Promise<void> {
  const command = { type: OPERATION, expenseId: input.expenseId, expectedVersion: input.expectedVersion, filename: input.file.filename, mimeType: input.file.mimeType, sizeBytes: input.file.sizeBytes, sha256: input.file.sha256 };
  await tx.execute('INSERT INTO "FinanceAudit" (id,"businessId",action,"sourceId","actorUserId","occurredAt",details) VALUES ($1,$2,$3,$4,$5,$7::timestamp,$6::jsonb)', [randomUUID(), input.businessId, OPERATION, input.expenseId, input.actorUserId, JSON.stringify({ command, beforeVersion: input.expectedVersion, afterVersion: result.version, relatedIds: [result.id], reason: null, result }), result.file.createdAt]);
}
