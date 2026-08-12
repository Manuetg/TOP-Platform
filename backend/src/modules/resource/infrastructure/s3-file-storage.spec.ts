const send = jest.fn();
const getSignedUrl = jest.fn();
const s3ClientConstructor = jest.fn(() => ({ send }));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: s3ClientConstructor,
  PutObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
  DeleteObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
  GetObjectCommand: class { constructor(readonly input: Record<string, unknown>) {} },
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));

import { S3FileStorage } from './s3-file-storage';

describe('S3FileStorage', () => {
  const config = (values: Record<string, string | undefined>) => ({ get: (key: string): string | undefined => values[key] });
  const completeConfig = { S3_ENDPOINT: 'http://minio', S3_REGION: 'us-east-1', S3_BUCKET: 'private', S3_ACCESS_KEY: 'key', S3_SECRET_KEY: 'secret', S3_FORCE_PATH_STYLE: 'true' };
  beforeEach(() => { send.mockReset().mockResolvedValue({}); getSignedUrl.mockReset().mockResolvedValue('https://signed.test/image'); s3ClientConstructor.mockClear(); });
  it.each(['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])('requiere %s en la configuración S3', (missing) => {
    expect(() => new S3FileStorage(config({ ...completeConfig, [missing]: undefined }) as never)).toThrow('La configuración S3 es obligatoria.');
  });
  it('sube, firma y elimina usando bucket, key y MIME', async () => {
    const storage = new S3FileStorage(config(completeConfig) as never);
    await storage.upload({ key: 'a.jpg', buffer: Buffer.from('x'), mimeType: 'image/jpeg' });
    await storage.delete('a.jpg');
    await expect(storage.createSignedReadUrl('a.jpg')).resolves.toBe('https://signed.test/image');
    expect(s3ClientConstructor).toHaveBeenCalledWith({ endpoint: 'http://minio', region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: 'key', secretAccessKey: 'secret' } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ input: { Bucket: 'private', Key: 'a.jpg', Body: Buffer.from('x'), ContentType: 'image/jpeg', ContentLength: 1 } }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ input: { Bucket: 'private', Key: 'a.jpg' } }));
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: { Bucket: 'private', Key: 'a.jpg' } }),
      { expiresIn: 3600 },
    );
  });

  it('configura path style como falso cuando no recibe true', () => {
    new S3FileStorage(config({ ...completeConfig, S3_FORCE_PATH_STYLE: 'false' }) as never);

    expect(s3ClientConstructor).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: false }));
  });
});
