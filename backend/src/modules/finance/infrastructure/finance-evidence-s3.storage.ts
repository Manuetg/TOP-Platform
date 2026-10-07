import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readS3Configuration } from '../../../config/environment';
import {
  assertFinanceEvidenceIntegrity, assertFinanceEvidenceStorageKey, FinancialFileInputError,
  FinancialFileIntegrityError, FinancialFileUnavailableError, MAX_FINANCE_EVIDENCE_BYTES, validateFinanceEvidenceFile,
} from '../domain/finance-evidence-file.rules';
import type { FinanceEvidenceStoragePort, FinanceEvidenceUpload } from '../domain/finance-evidence-storage.port';

interface ConfigurationReader { get(key: string): unknown }
export interface FinanceEvidenceS3Options {
  // El integrador debe verificar bucket/policy privados. No se infiere privacidad
  // a partir de la configuración S3 de imágenes ni se crea un bucket o una policy.
  privateBucket?: boolean;
}
function unavailable(): never {
  throw new FinancialFileUnavailableError('El almacenamiento privado no está disponible.');
}
function integrity(): never {
  throw new FinancialFileIntegrityError('No se pudo verificar la integridad del archivo privado.');
}
function closeBody(body: unknown): void {
  if (body && typeof body === 'object' && 'destroy' in body && typeof body.destroy === 'function') {
    const destroy = body.destroy as () => void;
    destroy.call(body);
  }
}
function validLength(length: unknown): length is number {
  return typeof length === 'number' && Number.isSafeInteger(length) && length > 0 && length <= MAX_FINANCE_EVIDENCE_BYTES;
}
function iterableBody(body: unknown): body is AsyncIterable<Uint8Array> {
  return Boolean(body && typeof body === 'object' && Symbol.asyncIterator in body
    && typeof body[Symbol.asyncIterator] === 'function');
}
async function readBoundedBody(body: unknown, length: number): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    if (body.byteLength !== length) integrity();
    return Buffer.from(body);
  }
  if (!iterableBody(body)) integrity();
  const result = Buffer.alloc(length);
  let size = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) integrity();
    if (size + chunk.byteLength > length || size + chunk.byteLength > MAX_FINANCE_EVIDENCE_BYTES) integrity();
    result.set(chunk, size);
    size += chunk.byteLength;
  }
  if (size !== length) integrity();
  return result;
}
function knownFileError(error: unknown): boolean {
  return error instanceof FinancialFileInputError || error instanceof FinancialFileIntegrityError
    || error instanceof FinancialFileUnavailableError;
}

export class FinanceEvidenceS3Storage implements FinanceEvidenceStoragePort {
  readonly enabled: boolean;
  private readonly client?: S3Client;
  private readonly bucket?: string;
  constructor(config: ConfigurationReader, options: FinanceEvidenceS3Options = {}) {
    this.enabled = options.privateBucket === true && config.get('FINANCE_EVIDENCE_STORAGE') === 's3-private'
      && config.get('FINANCE_S3_BUCKET') !== undefined;
    if (!this.enabled) return;
    try {
      const privateConfig: ConfigurationReader = { get: key => key === 'S3_BUCKET' ? config.get('FINANCE_S3_BUCKET') : config.get(key) };
      const { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle } = readS3Configuration(privateConfig);
      this.bucket = bucket;
      this.client = new S3Client({ endpoint, region, forcePathStyle, credentials: { accessKeyId, secretAccessKey } });
    } catch {
      unavailable();
    }
  }

  private connection(): { client: S3Client; bucket: string } {
    if (!this.enabled || !this.client || !this.bucket) unavailable();
    return { client: this.client, bucket: this.bucket };
  }

  async upload(input: FinanceEvidenceUpload): Promise<void> {
    const { client, bucket } = this.connection();
    assertFinanceEvidenceStorageKey(input.key);
    const file = validateFinanceEvidenceFile({ filename: 'evidence', mimeType: input.mimeType, bytes: input.bytes });
    assertFinanceEvidenceIntegrity(file.bytes, { sizeBytes: file.sizeBytes, sha256: input.sha256 });
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: input.key, Body: file.bytes, ContentType: file.mimeType, ContentLength: file.sizeBytes,
        ACL: 'private', IfNoneMatch: '*', Metadata: { sha256: file.sha256 },
        ChecksumSHA256: Buffer.from(file.sha256, 'hex').toString('base64'),
      }));
    } catch {
      // No se asume rollback del objeto tras timeout/commit incierto.
      unavailable();
    }
  }

  async download(key: string): Promise<Buffer> {
    const { client, bucket } = this.connection();
    assertFinanceEvidenceStorageKey(key);
    let body: unknown;
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' }));
      body = response.Body;
      if (!validLength(response.ContentLength)) integrity();
      const bytes = await readBoundedBody(body, response.ContentLength);
      const sha256 = response.Metadata?.sha256;
      if (typeof sha256 !== 'string') integrity();
      assertFinanceEvidenceIntegrity(bytes, { sizeBytes: response.ContentLength, sha256 });
      if (response.ChecksumSHA256 && response.ChecksumSHA256 !== Buffer.from(sha256, 'hex').toString('base64')) integrity();
      try {
        validateFinanceEvidenceFile({ filename: 'evidence', mimeType: response.ContentType, bytes });
      } catch {
        integrity();
      }
      // El repository compara de nuevo SHA/tamaño con la metadata DB y autoriza
      // Owner/tenant actual por petición. No hay signed URL ni acceso anónimo.
      return bytes;
    } catch (error) {
      if (knownFileError(error)) throw error;
      unavailable();
    } finally {
      closeBody(body);
    }
  }

  async deleteOwned(key: string): Promise<void> {
    const { client, bucket } = this.connection();
    assertFinanceEvidenceStorageKey(key);
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      unavailable();
    }
  }
}
