import { ConfigService } from '@nestjs/config';
import { createFileStorage } from './resource.module';
import { InMemoryFileStorage } from './infrastructure/in-memory-file-storage';
import { S3FileStorage } from './infrastructure/s3-file-storage';

describe('selección de almacenamiento en ResourceModule', () => {
  const config = (values: Record<string, unknown>): ConfigService => {
    const service = new ConfigService(values);
    jest.spyOn(service, 'get').mockImplementation((key: string) => values[key]);
    return service;
  };
  const completeS3 = {
    S3_ENDPOINT: 'https://storage.top.test', S3_REGION: 'us-east-1', S3_BUCKET: 'images',
    S3_ACCESS_KEY: 'synthetic-key', S3_SECRET_KEY: 'synthetic-secret', S3_FORCE_PATH_STYLE: true,
  };

  it.each(['development', 'test'])('conserva almacenamiento efímero local en %s', (environment) => {
    const memory = new InMemoryFileStorage();
    expect(createFileStorage(config({ NODE_ENV: environment }), memory)).toBe(memory);
  });

  it.each([{}, { S3_BUCKET: '' }, { S3_BUCKET: 'images' }])('rechaza producción sin S3 completo: %j', (storage) => {
    expect(() => createFileStorage(config({ NODE_ENV: 'production', ...storage }), new InMemoryFileStorage())).toThrow(/S3_/);
  });

  it('selecciona el adaptador persistente con S3 válido en producción', () => {
    expect(createFileStorage(config({ NODE_ENV: 'production', ...completeS3 }), new InMemoryFileStorage())).toBeInstanceOf(S3FileStorage);
  });

  it('conserva MinIO HTTP configurado en desarrollo', () => {
    expect(createFileStorage(config({ NODE_ENV: 'development', ...completeS3, S3_ENDPOINT: 'http://localhost:9000' }), new InMemoryFileStorage())).toBeInstanceOf(S3FileStorage);
  });

  it('firma URLs con el SDK existente, endpoint público, path y vencimiento conservados', async () => {
    const storage = createFileStorage(config({
      NODE_ENV: 'production', ...completeS3,
      S3_ENDPOINT: 'https://internal.top.test:9443', S3_PUBLIC_ENDPOINT: 'https://objects.top.test:9443',
    }), new InMemoryFileStorage());
    const url = new URL(await storage.createSignedReadUrl('businesses/b1/resources/r1/image name.jpg'));
    expect(url.origin).toBe('https://objects.top.test:9443');
    expect(url.pathname).toBe('/images/businesses/b1/resources/r1/image%20name.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f\d]{64}$/);
  });
});
