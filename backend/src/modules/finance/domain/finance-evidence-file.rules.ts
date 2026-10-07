import { createHash } from 'node:crypto';

export const MAX_FINANCE_EVIDENCE_BYTES = 2 * 1024 * 1024;
export const FINANCE_EVIDENCE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type FinanceEvidenceMimeType = typeof FINANCE_EVIDENCE_MIME_TYPES[number];

export class FinancialFileInputError extends Error {
  readonly code = 'FINANCIAL_FILE_INPUT';
}
export class FinancialFileUnavailableError extends Error {
  readonly code = 'FINANCIAL_FILE_UNAVAILABLE';
}
export class FinancialFileIntegrityError extends Error {
  readonly code = 'FINANCIAL_FILE_INTEGRITY';
}

export interface FinanceEvidenceFileInput {
  filename: unknown;
  mimeType: unknown;
  bytes: unknown;
}
export interface ValidatedFinanceEvidenceFile {
  readonly filename: string;
  readonly mimeType: FinanceEvidenceMimeType;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly bytes: Buffer;
}

function inputError(): never {
  throw new FinancialFileInputError('El archivo no cumple el formato o los límites admitidos.');
}

function plainFilename(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || value !== value.trim()) inputError();
  if (value === '.' || value === '..' || /[\p{Cc}\p{Cf}\u2028\u2029\\/:<>|"*?]/u.test(value)) inputError();
  return value;
}

function allowedMime(value: unknown): FinanceEvidenceMimeType {
  if (typeof value !== 'string' || !FINANCE_EVIDENCE_MIME_TYPES.includes(value as FinanceEvidenceMimeType)) inputError();
  return value as FinanceEvidenceMimeType;
}

function boundedBytes(value: unknown): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > MAX_FINANCE_EVIDENCE_BYTES) inputError();
  return Buffer.from(value);
}

// Verificación de envoltura, no decodificación completa ni antivirus. Se rechazan
// nombres PDF activos explícitos, incluso escapes #xx; streams comprimidos y
// semántica interna no se analizan. No implica que un documento esté libre de malware.
function validPdf(bytes: Buffer): boolean {
  if (bytes.length < 32 || !/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(bytes.toString('latin1', 0, 12))) return false;
  const text = bytes.toString('latin1');
  const tail = /startxref[\t\r\n ]+(\d+)[\t\r\n ]+%%EOF[\t\r\n\f ]*$/.exec(text);
  if (!tail || Number(tail[1]) >= bytes.length) return false;
  const decodedNames = text.replace(/#([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replaceAll(String.fromCharCode(0), ' ');
  return !/\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles?|RichMedia|XFA|SubmitForm|ImportData|AcroForm|Encrypt|URI)(?=[\s/<>()[\]{}%]|$)/i.test(decodedNames)
    && !/<(?:script|html)\b|<!doctype\s+html/i.test(text);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function pngCrc(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function validPngHeader(bytes: Buffer): boolean {
  const colorDepths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  return bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    && bytes.readUInt32BE(16) <= 0x7fffffff && bytes.readUInt32BE(20) <= 0x7fffffff
    && Boolean(colorDepths[bytes[25]]?.includes(bytes[24]))
    && bytes[26] === 0 && bytes[27] === 0 && bytes[28] <= 1;
}

interface PngChunk { kind: string; length: number; end: number }
function pngChunk(bytes: Buffer, offset: number): PngChunk | null {
  if (offset + 12 > bytes.length) return null;
  const length = bytes.readUInt32BE(offset);
  const end = offset + 12 + length;
  if (end > bytes.length) return null;
  const kind = bytes.toString('ascii', offset + 4, offset + 8);
  if (!/^[A-Za-z]{4}$/.test(kind) || pngCrc(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return null;
  return { kind, length, end };
}
function pngHeaderEnd(bytes: Buffer): number | null {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const header = pngChunk(bytes, 8);
  if (!header || header.kind !== 'IHDR' || header.length !== 13 || !validPngHeader(bytes)) return null;
  return header.end;
}
function pngEnd(chunk: PngChunk, hasImageData: boolean, size: number): boolean {
  return chunk.length === 0 && hasImageData && chunk.end === size;
}

// Comprueba firma, longitudes, IHDR, CRC, IDAT e IEND; no infla ni renderiza píxeles.
function validPng(bytes: Buffer): boolean {
  let offset = pngHeaderEnd(bytes);
  if (offset === null) return false;
  let imageData = false;
  while (offset < bytes.length) {
    const chunk = pngChunk(bytes, offset);
    if (!chunk) return false;
    if (chunk.kind === 'IEND') return pngEnd(chunk, imageData, bytes.length);
    if (chunk.kind === 'IHDR') return false;
    imageData = imageData || (chunk.kind === 'IDAT' && chunk.length > 0);
    offset = chunk.end;
  }
  return false;
}

function jpegFrame(bytes: Buffer, start: number, length: number): boolean {
  if (length < 11 || start + length > bytes.length) return false;
  const components = bytes[start + 7];
  return bytes.readUInt16BE(start + 3) > 0 && bytes.readUInt16BE(start + 5) > 0
    && components > 0 && length === 8 + 3 * components;
}
interface JpegSegment { marker: number; start: number; length: number; end: number }
function jpegSegment(bytes: Buffer, offset: number): JpegSegment | null {
  if (bytes[offset] !== 255) return null;
  while (bytes[offset] === 255) offset += 1;
  const marker = bytes[offset++];
  if (marker === undefined || marker < 192 || [216, 217].includes(marker)) return null;
  if (offset + 2 > bytes.length - 2) return null;
  const length = bytes.readUInt16BE(offset);
  if (length < 2 || offset + length > bytes.length - 2) return null;
  return { marker, start: offset, length, end: offset + length };
}
function jpegSignature(bytes: Buffer): boolean {
  return bytes.length >= 20 && bytes.readUInt16BE(0) === 0xffd8 && bytes.readUInt16BE(bytes.length - 2) === 0xffd9;
}
function jpegScan(frame: boolean, segment: JpegSegment, size: number): boolean {
  return frame && segment.length >= 6 && segment.end < size - 2;
}

// Comprueba marcadores/cabeceras hasta SOS y cierre EOI; no decodifica entropía.
function validJpeg(bytes: Buffer): boolean {
  if (!jpegSignature(bytes)) return false;
  let offset = 2;
  let frame = false;
  while (offset + 4 <= bytes.length - 2) {
    const segment = jpegSegment(bytes, offset);
    if (!segment) return false;
    if (segment.marker === 218) return jpegScan(frame, segment, bytes.length);
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(segment.marker)) {
      if (!jpegFrame(bytes, segment.start, segment.length)) return false;
      frame = true;
    }
    offset = segment.end;
  }
  return false;
}

export function validateFinanceEvidenceFile(input: FinanceEvidenceFileInput): ValidatedFinanceEvidenceFile {
  if (!input || typeof input !== 'object') inputError();
  const filename = plainFilename(input.filename);
  const mimeType = allowedMime(input.mimeType);
  const bytes = boundedBytes(input.bytes);
  const validators = { 'application/pdf': validPdf, 'image/png': validPng, 'image/jpeg': validJpeg };
  if (!validators[mimeType](bytes)) inputError();
  return Object.freeze({ filename, mimeType, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
}

export function assertFinanceEvidenceIntegrity(bytes: Uint8Array, expected: { sizeBytes: number; sha256: string }): void {
  if (!expected || !(bytes instanceof Uint8Array) || !Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes < 1
    || expected.sizeBytes > MAX_FINANCE_EVIDENCE_BYTES || bytes.byteLength !== expected.sizeBytes
    || !/^[a-f0-9]{64}$/.test(expected.sha256) || createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
    throw new FinancialFileIntegrityError('No se pudo verificar la integridad del archivo privado.');
  }
}

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const OWNED_KEY = new RegExp(`^finance-evidence/${UUID}/${UUID}/${UUID}$`);
export function assertFinanceEvidenceStorageKey(key: string): void {
  if (typeof key !== 'string' || OWNED_KEY.exec(key)?.[0] !== key) inputError();
}
export function financeEvidenceStorageKey(businessId: string, expenseId: string, fileId: string): string {
  const key = `finance-evidence/${businessId}/${expenseId}/${fileId}`;
  assertFinanceEvidenceStorageKey(key);
  return key;
}
