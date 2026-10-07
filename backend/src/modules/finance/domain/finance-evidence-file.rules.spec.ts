import { createHash } from 'node:crypto';
import {
  assertFinanceEvidenceIntegrity, assertFinanceEvidenceStorageKey, financeEvidenceStorageKey,
  FinancialFileInputError, FinancialFileIntegrityError, FinancialFileUnavailableError,
  MAX_FINANCE_EVIDENCE_BYTES, validateFinanceEvidenceFile,
} from './finance-evidence-file.rules';

const BUSINESS = '11111111-1111-4111-8111-111111111111';
const EXPENSE = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
// Fixture JPEG blanco 1x1 sintético, generado con System.Drawing; sin datos reales.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==', 'base64');

function pdf(padding = 0, extra = ''): Buffer {
  let text = '%PDF-1.7\n%' + '.'.repeat(padding) + '\n' + extra;
  const offsets = [0];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] /Contents 4 0 R >>',
    '<< /Length 15 >>\nstream\n0 0 10 10 re f\nendstream',
  ];
  objects.forEach((value, index) => {
    offsets.push(Buffer.byteLength(text));
    text += (index + 1) + ' 0 obj\n' + value + '\nendobj\n';
  });
  const xref = Buffer.byteLength(text);
  text += 'xref\n0 5\n0000000000 65535 f \n';
  text += offsets.slice(1).map(offset => offset.toString().padStart(10, '0') + ' 00000 n \n').join('');
  text += 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(text);
}

function exactSizePdf(size: number): Buffer {
  let padding = size - pdf().length;
  let bytes = pdf(padding);
  for (let attempt = 0; attempt < 3 && bytes.length !== size; attempt += 1) {
    padding += size - bytes.length;
    bytes = pdf(padding);
  }
  return bytes;
}

describe('Finance archivos privados: reglas de formato e integridad', () => {
  it.each([
    ['documento.pdf', 'application/pdf', pdf()],
    ['imagen.png', 'image/png', PNG],
    ['imagen.jpeg', 'image/jpeg', JPEG],
  ])('conserva metadata server y SHA256 de %s sin usar datos del cliente como hash', (filename, mimeType, bytes) => {
    const result = validateFinanceEvidenceFile({ filename, mimeType, bytes });
    expect(result).toEqual({ filename, mimeType, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), bytes });
    expect(result.bytes).not.toBe(bytes);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('acota exactamente 2 MiB y conserva el hash ante mutación del buffer original', () => {
    const bytes = exactSizePdf(MAX_FINANCE_EVIDENCE_BYTES);
    expect(bytes.length).toBe(2097152);
    const result = validateFinanceEvidenceFile({ filename: 'limite.pdf', mimeType: 'application/pdf', bytes });
    const before = Buffer.from(result.bytes);
    bytes.fill(0);
    expect(result.bytes).toEqual(before);
    expect(result.sha256).toBe(createHash('sha256').update(before).digest('hex'));
    expect(() => validateFinanceEvidenceFile({ filename: 'demasiado.pdf', mimeType: 'application/pdf', bytes: exactSizePdf(MAX_FINANCE_EVIDENCE_BYTES + 1) })).toThrow(FinancialFileInputError);
  });

  it.each(['a', 'a'.repeat(160), 'Recibo ñ 01.pdf'])('permite nombre plano de longitud admitida: %s', filename => {
    expect(validateFinanceEvidenceFile({ filename, mimeType: 'image/png', bytes: PNG }).filename).toBe(filename);
  });

  it.each(['', 'a'.repeat(161), '.', '..', ' ../a.pdf', 'a.pdf ', '../a.pdf', 'a/b.pdf', 'a\\b.pdf',
    'C:a.pdf', 'a\u0000.pdf', 'a\r\n.pdf', 'a\u007f.pdf', 'a\u0085.pdf', 'a\u202e.pdf', 'a\u2028.pdf',
    'a"b.pdf', '<script>.pdf', null, 123])('rechaza nombres de path, control o cabecera: %j', filename => {
    expect(() => validateFinanceEvidenceFile({ filename, mimeType: 'image/png', bytes: PNG })).toThrow(FinancialFileInputError);
  });

  it.each(['image/svg+xml', 'text/html', 'application/octet-stream', 'IMAGE/PNG', 'image/png; charset=utf-8', null])(
    'rechaza MIME fuera del allowlist: %j', mimeType => {
      expect(() => validateFinanceEvidenceFile({ filename: 'comprobante', mimeType, bytes: PNG })).toThrow(FinancialFileInputError);
    },
  );

  it.each([
    ['application/pdf', PNG], ['image/png', JPEG], ['image/jpeg', pdf()],
    ['image/png', Buffer.from('<html><script>alert(1)</script></html>')],
    ['application/pdf', Buffer.from('<svg onload="alert(1)"></svg>')],
  ])('rechaza MIME %s incoherente con magic o HTML/SVG', (mimeType, bytes) => {
    expect(() => validateFinanceEvidenceFile({ filename: 'archivo', mimeType, bytes })).toThrow(FinancialFileInputError);
  });

  it.each([Buffer.alloc(0), 'bytes', [], null, new ArrayBuffer(10)])('rechaza payload sin bytes válidos: %j', bytes => {
    expect(() => validateFinanceEvidenceFile({ filename: 'archivo', mimeType: 'image/png', bytes })).toThrow(FinancialFileInputError);
  });

  it.each([
    ['application/pdf', Buffer.from('%PDF-1.7')], ['image/png', PNG.subarray(0, 8)],
    ['image/png', PNG.subarray(0, 28)], ['image/jpeg', JPEG.subarray(0, 16)],
    ['image/jpeg', Buffer.from([255, 216, 255, 217])],
  ])('rechaza cabecera o cierre truncado de %s', (mimeType, bytes) => {
    expect(() => validateFinanceEvidenceFile({ filename: 'archivo', mimeType, bytes })).toThrow(FinancialFileInputError);
  });

  it.each(['/JavaScript', '/JS', '/OpenAction', '/AA', '/Launch', '/EmbeddedFiles', '/RichMedia',
    '/XFA', '/SubmitForm', '/ImportData', '/AcroForm', '/Encrypt', '/URI', '/J#61vaScript', '/jAvAsCrIpT'])(
    'niega conservadoramente token PDF activo %s', token => {
      expect(() => validateFinanceEvidenceFile({ filename: 'activo.pdf', mimeType: 'application/pdf', bytes: pdf(0, token + ' (contenido)\n') })).toThrow(FinancialFileInputError);
    },
  );

  it('niega HTML intercalado, nombre activo terminado por NUL y contenido después de EOF', () => {
    for (const bytes of [pdf(0, '<script>alert(1)</script>\n'), pdf(0, '/JavaScript\u0000 (contenido)\n'), Buffer.concat([pdf(), Buffer.from('<html>tail</html>')])]) {
      expect(() => validateFinanceEvidenceFile({ filename: 'activo.pdf', mimeType: 'application/pdf', bytes })).toThrow(FinancialFileInputError);
    }
    expect(validateFinanceEvidenceFile({ filename: 'pasivo.pdf', mimeType: 'application/pdf', bytes: pdf(0, '/JSX (literal pasivo)\n') }).mimeType).toBe('application/pdf');
  });

  it('rechaza CRC PNG corrupto, chunk truncado y bytes después de IEND', () => {
    const badCrc = Buffer.from(PNG);
    badCrc[29] ^= 1;
    const badLength = Buffer.from(PNG);
    badLength.writeUInt32BE(0xffffffff, 8);
    for (const bytes of [badCrc, badLength, PNG.subarray(0, PNG.length - 1), Buffer.concat([PNG, Buffer.from('<html>')])]) {
      expect(() => validateFinanceEvidenceFile({ filename: 'imagen.png', mimeType: 'image/png', bytes })).toThrow(FinancialFileInputError);
    }
  });

  it('rechaza longitud de segmento JPEG corrupta y tail después de EOI', () => {
    const badSegment = Buffer.from(JPEG);
    badSegment.writeUInt16BE(65535, 4);
    for (const bytes of [badSegment, Buffer.concat([JPEG, Buffer.from('<html>')])]) {
      expect(() => validateFinanceEvidenceFile({ filename: 'imagen.jpg', mimeType: 'image/jpeg', bytes })).toThrow(FinancialFileInputError);
    }
  });

  it('compara tamaño y SHA256 server contra metadata autoritativa', () => {
    const expected = { sizeBytes: PNG.length, sha256: createHash('sha256').update(PNG).digest('hex') };
    expect(() => assertFinanceEvidenceIntegrity(PNG, expected)).not.toThrow();
    const modified = Buffer.from(PNG);
    modified[40] ^= 1;
    for (const [bytes, metadata] of [
      [modified, expected], [PNG, { ...expected, sizeBytes: PNG.length + 1 }],
      [PNG, { ...expected, sha256: '0'.repeat(64) }], [PNG, { ...expected, sha256: expected.sha256.toUpperCase() }],
      [PNG, { ...expected, sizeBytes: MAX_FINANCE_EVIDENCE_BYTES + 1 }],
    ] as const) expect(() => assertFinanceEvidenceIntegrity(bytes, metadata)).toThrow(FinancialFileIntegrityError);
  });

  it('forma una key opaca tenant/expense/file y rechaza todo fuera del namespace canónico', () => {
    const key = financeEvidenceStorageKey(BUSINESS, EXPENSE, FILE);
    expect(key).toBe('finance-evidence/' + BUSINESS + '/' + EXPENSE + '/' + FILE);
    expect(() => assertFinanceEvidenceStorageKey(key)).not.toThrow();
    for (const invalid of ['images/' + FILE, key + '\n', key + '/tail', key.replace(EXPENSE, '..'), key.toUpperCase(), 'https://public/' + key]) {
      expect(() => assertFinanceEvidenceStorageKey(invalid)).toThrow(FinancialFileInputError);
    }
  });

  it('expone únicamente códigos tipados, sin detalles de proveedor ni secretos', () => {
    expect(new FinancialFileInputError().code).toBe('FINANCIAL_FILE_INPUT');
    expect(new FinancialFileUnavailableError().code).toBe('FINANCIAL_FILE_UNAVAILABLE');
    expect(new FinancialFileIntegrityError().code).toBe('FINANCIAL_FILE_INTEGRITY');
  });
});
