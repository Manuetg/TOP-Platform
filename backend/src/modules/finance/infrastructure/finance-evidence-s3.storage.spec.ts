const send = jest.fn<Promise<unknown>, [{ input: Record<string, unknown> }]>();
const s3Constructor = jest.fn(() => ({ send }));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: s3Constructor,
  PutObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
  GetObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
  DeleteObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
}));

import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  FinancialFileInputError, FinancialFileIntegrityError, FinancialFileUnavailableError,
  financeEvidenceStorageKey, MAX_FINANCE_EVIDENCE_BYTES,
} from '../domain/finance-evidence-file.rules';
import { FinanceEvidenceS3Storage } from './finance-evidence-s3.storage';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const HASH = createHash('sha256').update(PNG).digest('hex');
const KEY = financeEvidenceStorageKey('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
const CONFIG = {
  S3_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: 'http://unused-public:9000',
  S3_REGION: 'us-east-1', S3_BUCKET: 'public-resource-images',
  FINANCE_EVIDENCE_STORAGE: 's3-private', FINANCE_S3_BUCKET: 'private-evidence',
  S3_ACCESS_KEY: 'synthetic-key', S3_SECRET_KEY: 'synthetic-secret', S3_FORCE_PATH_STYLE: true,
};
const config = (values: Record<string, unknown> = CONFIG) => ({ get: (key: string): unknown => values[key] });
function response(body: unknown = Readable.from([PNG.subarray(0, 20), PNG.subarray(20)])) {
  return { Body: body, ContentLength: PNG.length, ContentType: 'image/png', Metadata: { sha256: HASH } };
}
function storage(): FinanceEvidenceS3Storage { return new FinanceEvidenceS3Storage(config(), { privateBucket: true }); }

describe('Finance evidencia S3 privada: pruebas unitarias con SDK mock, sin proveedor real', () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    s3Constructor.mockClear();
  });

  it('queda disabled por defecto incluso con S3 de imágenes configurado y no realiza I/O', async () => {
    const disabled = new FinanceEvidenceS3Storage(config());
    expect(disabled.enabled).toBe(false);
    await expect(disabled.upload({ key: KEY, bytes: PNG, mimeType: 'image/png', sha256: HASH })).rejects.toBeInstanceOf(FinancialFileUnavailableError);
    await expect(disabled.download(KEY)).rejects.toBeInstanceOf(FinancialFileUnavailableError);
    await expect(disabled.deleteOwned(KEY)).rejects.toBeInstanceOf(FinancialFileUnavailableError);
    expect(s3Constructor).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('queda disabled si falta bucket y traduce configuración parcial sin filtrar secretos', () => {
    expect(new FinanceEvidenceS3Storage(config({}), { privateBucket: true }).enabled).toBe(false);
    expect(new FinanceEvidenceS3Storage(config({ ...CONFIG, FINANCE_S3_BUCKET: undefined }), { privateBucket: true }).enabled).toBe(false);
    expect(new FinanceEvidenceS3Storage(config({ ...CONFIG, FINANCE_EVIDENCE_STORAGE: undefined }), { privateBucket: true }).enabled).toBe(false);
    expect(new FinanceEvidenceS3Storage(config({ ...CONFIG, FINANCE_EVIDENCE_STORAGE: 'public' }), { privateBucket: true }).enabled).toBe(false);
    expect(() => new FinanceEvidenceS3Storage(config({ ...CONFIG, S3_REGION: undefined }), { privateBucket: true })).toThrow(FinancialFileUnavailableError);
    expect(s3Constructor).not.toHaveBeenCalled();
  });

  it('usa un cliente interno, put privado con checksum y creación sin overwrite', async () => {
    const provider = storage();
    expect(provider.enabled).toBe(true);
    const bytes = Buffer.from(PNG);
    await provider.upload({ key: KEY, bytes, mimeType: 'image/png', sha256: HASH });
    expect(s3Constructor).toHaveBeenCalledTimes(1);
    expect(s3Constructor).toHaveBeenCalledWith({
      endpoint: CONFIG.S3_ENDPOINT, region: CONFIG.S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: CONFIG.S3_ACCESS_KEY, secretAccessKey: CONFIG.S3_SECRET_KEY },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: CONFIG.FINANCE_S3_BUCKET, Key: KEY, Body: PNG, ContentType: 'image/png', ContentLength: PNG.length,
      ACL: 'private', IfNoneMatch: '*', Metadata: { sha256: HASH }, ChecksumSHA256: Buffer.from(HASH, 'hex').toString('base64'),
    });
    expect(send.mock.calls[0][0].input.Body).not.toBe(bytes);
    expect('createSignedReadUrl' in provider).toBe(false);
  });

  it('rechaza key ajena, formato y hash incoherentes antes de llamar S3', async () => {
    const provider = storage();
    await expect(provider.upload({ key: 'resources/public/a.png', bytes: PNG, mimeType: 'image/png', sha256: HASH })).rejects.toBeInstanceOf(FinancialFileInputError);
    await expect(provider.upload({ key: KEY, bytes: PNG, mimeType: 'application/pdf', sha256: HASH })).rejects.toBeInstanceOf(FinancialFileInputError);
    await expect(provider.upload({ key: KEY, bytes: PNG, mimeType: 'image/png', sha256: '0'.repeat(64) })).rejects.toBeInstanceOf(FinancialFileIntegrityError);
    expect(send).not.toHaveBeenCalled();
  });

  it('lee por proxy privado, limita el stream y verifica longitud/hash, nunca devuelve URL', async () => {
    const body = Readable.from([PNG.subarray(0, 20), PNG.subarray(20)]);
    send.mockResolvedValue(response(body));
    const bytes = await storage().download(KEY);
    expect(bytes).toEqual(PNG);
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: CONFIG.FINANCE_S3_BUCKET, Key: KEY, ChecksumMode: 'ENABLED' });
  });

  it('acepta bytes directos sólo con longitud y metadata coherentes', async () => {
    send.mockResolvedValue({ ...response(PNG), ChecksumSHA256: Buffer.from(HASH, 'hex').toString('base64') });
    const bytes = await storage().download(KEY);
    expect(bytes).toEqual(PNG);
    expect(bytes).not.toBe(PNG);
  });

  it.each([undefined, 0, -1, 0.5, NaN, Infinity, MAX_FINANCE_EVIDENCE_BYTES + 1])(
    'rechaza ContentLength inválido %s y cierra body antes de consumirlo', async length => {
      const body = Readable.from([PNG]);
      const destroy = jest.spyOn(body, 'destroy');
      send.mockResolvedValue({ ...response(body), ContentLength: length });
      await expect(storage().download(KEY)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
      expect(destroy).toHaveBeenCalled();
    },
  );

  it('aborta stream mayor que ContentLength sin acumular todos sus chunks', async () => {
    let reads = 0;
    const body = {
      async *[Symbol.asyncIterator]() {
        reads += 1; yield await Promise.resolve(Buffer.alloc(PNG.length + 1));
        reads += 1; yield await Promise.resolve(Buffer.alloc(10));
      },
      destroy: jest.fn(),
    };
    send.mockResolvedValue(response(body));
    await expect(storage().download(KEY)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
    expect(reads).toBe(1);
    expect(body.destroy).toHaveBeenCalled();
  });

  it('rechaza stream corto, ausente o que produce strings', async () => {
    const provider = storage();
    for (const body of [Readable.from([PNG.subarray(0, 20)]), undefined, Readable.from(['texto'])]) {
      send.mockResolvedValue(response(body));
      // response(undefined) usa el default; para ausencia real se sustituye Body.
      if (body === undefined) send.mockResolvedValue({ ...response(), Body: undefined });
      await expect(provider.download(KEY)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
    }
  });

  it('rechaza corrupción de hash, metadata omitida, checksum distinto y MIME incoherente', async () => {
    const provider = storage();
    const corrupt = Buffer.from(PNG);
    corrupt[40] ^= 1;
    for (const invalid of [
      response(corrupt), { ...response(PNG), Metadata: {} },
      { ...response(PNG), ChecksumSHA256: Buffer.alloc(32).toString('base64') },
      { ...response(PNG), ContentType: 'text/html' },
    ]) {
      send.mockResolvedValue(invalid);
      await expect(provider.download(KEY)).rejects.toBeInstanceOf(FinancialFileIntegrityError);
    }
  });

  it('rechaza Get/Delete fuera de namespace canónico antes de enviar comandos', async () => {
    const provider = storage();
    for (const invalid of ['other/' + KEY, KEY + '\n', KEY + '/tail']) {
      await expect(provider.download(invalid)).rejects.toBeInstanceOf(FinancialFileInputError);
      await expect(provider.deleteOwned(invalid)).rejects.toBeInstanceOf(FinancialFileInputError);
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('deleteOwned envía sólo la key validada de compensación, sin URL ni borrado por prefijo', async () => {
    await storage().deleteOwned(KEY);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: CONFIG.FINANCE_S3_BUCKET, Key: KEY });
  });

  it('traduce fallos SDK y stream sin exponer mensajes o credenciales ni borrar ante incertidumbre', async () => {
    const provider = storage();
    send.mockRejectedValue(new Error('synthetic-secret transport'));
    for (const action of [
      () => provider.upload({ key: KEY, bytes: PNG, mimeType: 'image/png', sha256: HASH }),
      () => provider.download(KEY), () => provider.deleteOwned(KEY),
    ]) await expect(action()).rejects.toMatchObject({ code: 'FINANCIAL_FILE_UNAVAILABLE', message: 'El almacenamiento privado no está disponible.' });
    expect(send).toHaveBeenCalledTimes(3);
    const body = Readable.from((async function* () { yield await Promise.resolve(PNG.subarray(0, 20)); throw new Error('synthetic-secret stream'); })());
    send.mockResolvedValue(response(body));
    await expect(provider.download(KEY)).rejects.toMatchObject({ code: 'FINANCIAL_FILE_UNAVAILABLE' });
    expect(body.destroyed).toBe(true);
  });
});
