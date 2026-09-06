const send = jest.fn();
const getSignedUrl = jest.fn();

const s3ClientConstructor = jest.fn(() => ({
  send,
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: s3ClientConstructor,
  PutObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl,
}));

import { S3FileStorage } from './s3-file-storage';

describe('S3FileStorage', () => {
  const config = (
    values: Record<string, string | undefined>,
  ) => ({
    get: (key: string): string | undefined =>
      values[key],
  });

  const completeConfig = {
    S3_ENDPOINT: 'http://minio:9000',
    S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'private',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_FORCE_PATH_STYLE: 'true',
  };

  beforeEach(() => {
    send.mockReset().mockResolvedValue({});
    getSignedUrl
      .mockReset()
      .mockResolvedValue(
        'http://localhost:9000/private/image',
      );
    s3ClientConstructor.mockClear();
  });

  it.each([
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
  ])(
    'requiere %s en la configuración S3',
    (missing) => {
      expect(
        () =>
          new S3FileStorage(
            config({
              ...completeConfig,
              [missing]: undefined,
            }) as never,
          ),
      ).toThrow(
        'La configuración S3 es obligatoria.',
      );
    },
  );

  it('usa el endpoint interno para escritura y el público para URLs firmadas', async () => {
    const storage = new S3FileStorage(
      config(completeConfig) as never,
    );

    await storage.upload({
      key: 'a.jpg',
      buffer: Buffer.from('x'),
      mimeType: 'image/jpeg',
    });

    await storage.delete('a.jpg');

    await expect(
      storage.createSignedReadUrl('a.jpg'),
    ).resolves.toBe(
      'http://localhost:9000/private/image',
    );

    expect(s3ClientConstructor).toHaveBeenNthCalledWith(
      1,
      {
        endpoint: 'http://minio:9000',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'key',
          secretAccessKey: 'secret',
        },
      },
    );

    expect(s3ClientConstructor).toHaveBeenNthCalledWith(
      2,
      {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'key',
          secretAccessKey: 'secret',
        },
      },
    );

    expect(send).toHaveBeenCalledTimes(2);

    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: {
          Bucket: 'private',
          Key: 'a.jpg',
          Body: Buffer.from('x'),
          ContentType: 'image/jpeg',
          ContentLength: 1,
        },
      }),
    );

    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: {
          Bucket: 'private',
          Key: 'a.jpg',
        },
      }),
    );

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        input: {
          Bucket: 'private',
          Key: 'a.jpg',
        },
      }),
      {
        expiresIn: 3600,
      },
    );
  });

  it('reutiliza el mismo cliente cuando no hay endpoint público separado', async () => {
    const storage = new S3FileStorage(
      config({
        ...completeConfig,
        S3_PUBLIC_ENDPOINT: undefined,
      }) as never,
    );

    await storage.createSignedReadUrl('a.jpg');

    expect(s3ClientConstructor).toHaveBeenCalledTimes(1);

    expect(s3ClientConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'http://minio:9000',
      }),
    );
  });

  it('configura path style como falso cuando no recibe true', () => {
    new S3FileStorage(
      config({
        ...completeConfig,
        S3_FORCE_PATH_STYLE: 'false',
      }) as never,
    );

    expect(s3ClientConstructor).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        forcePathStyle: false,
      }),
    );

    expect(s3ClientConstructor).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        forcePathStyle: false,
      }),
    );
  });
});