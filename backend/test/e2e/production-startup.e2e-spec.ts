import type { INestApplication } from '@nestjs/common';
import fs from 'node:fs';
import { createServer } from 'node:net';
import request from 'supertest';

const productionSecret = 'c38915f240c67a5b7e3e9446a147b9908b3388128588ea538c6162d8ad20e7f4';
const resetSecret = '408310abeb409c0be1797f82c9902ed4c270c08d4e714e9388f1206811b972c43';
const allowedOrigin = 'https://app.top.invalid';
const secondaryOrigin = 'https://operations.top.invalid:8443';
const userId = '11111111-1111-4111-8111-111111111111';
const businessId = '22222222-2222-4222-8222-222222222222';
const configurationKey = /^(NODE_ENV|DATABASE_URL|PORT|CORS_ORIGIN|APP_PUBLIC_URL|JWT_.*|PASSWORD_RESET_.*|REFRESH_TOKEN_.*|EMAIL_.*|SMTP_.*|S3_.*|TOP_STARTUP_DOTENV_MARKER)$/;

function environment(mode = 'production', port = '3000'): Record<string, string> {
  const common = {
    NODE_ENV: mode,
    DATABASE_URL: 'postgresql://startup_user:synthetic-db-pass@127.0.0.1:5432/top_startup_test?schema=public&sslmode=require',
    PORT: port,
    JWT_ACCESS_SECRET: productionSecret,
    PASSWORD_RESET_OTP_SECRET: resetSecret,
    APP_PUBLIC_URL: 'https://app.top.invalid',
    CORS_ORIGIN: mode === 'production' ? `${allowedOrigin},${secondaryOrigin}` : 'http://localhost:3001',
    EMAIL_DELIVERY_MODE: mode === 'production' ? 'smtp' : 'console',
  };
  if (mode !== 'production') return common;
  return {
    ...common,
    SMTP_HOST: 'smtp.top.invalid',
    SMTP_PORT: '587',
    SMTP_FROM: 'noreply@top.invalid',
    S3_ENDPOINT: 'https://objects.top.invalid',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'startup-test',
    S3_ACCESS_KEY: 'synthetic-startup-access-key',
    S3_SECRET_KEY: 'synthetic-startup-storage-secret',
    S3_FORCE_PATH_STYLE: 'true',
  };
}

interface EnvironmentFileFixture { reads: jest.Mock; restore(): void }

async function withEnvironment<T>(values: Record<string, string>, operation: (environmentFile: EnvironmentFileFixture) => Promise<T>, dotenvContents = ''): Promise<T> {
  const original = process.env;
  process.env = configuredEnvironment(values);
  const environmentFile = mockEnvironmentFile(dotenvContents);
  try {
    return await operation(environmentFile);
  } finally {
    environmentFile.restore();
    process.env = original;
  }
}

function configuredEnvironment(values: Record<string, string>): NodeJS.ProcessEnv {
  const isolated = { ...process.env };
  for (const key of Object.keys(isolated)) if (configurationKey.test(key)) delete isolated[key];
  return { ...isolated, ...values };
}

function mockEnvironmentFile(contents: string): EnvironmentFileFixture {
  const reads = jest.fn();
  const originalRead = fs.readFileSync;
  const originalExists = fs.existsSync;
  const isEnvironmentFile = (file: fs.PathLike | number): boolean => /(?:^|[\\/])\.env(?:$|\.)/.test(String(file));
  const readFile = (file: fs.PathOrFileDescriptor, options?: unknown): string | Buffer => {
    if (!isEnvironmentFile(file)) return originalRead(file, options as BufferEncoding);
    reads(file);
    const encoding = typeof options === 'string' || (typeof options === 'object' && options !== null && 'encoding' in options && options.encoding !== null && options.encoding !== undefined);
    return encoding ? contents : Buffer.from(contents);
  };
  const read = jest.spyOn(fs, 'readFileSync').mockImplementation(readFile as typeof fs.readFileSync);
  const exists = jest.spyOn(fs, 'existsSync').mockImplementation((file) => isEnvironmentFile(file) || originalExists(file));
  return { reads, restore: () => { read.mockRestore(); exists.mockRestore(); } };
}

// Igual que los imports estáticos de las otras E2E, cargar los módulos antes
// de los hooks evita incluir la compilación inicial de TypeScript en su timeout.
const initialEnvironment = process.env;
process.env = configuredEnvironment(environment());
const preloadEnvironmentFile = mockEnvironmentFile('');
try {
  jest.isolateModules(() => {
    jest.requireActual('@nestjs/testing');
    jest.requireActual('@nestjs/platform-express');
    jest.requireActual('../../src/app.module');
    jest.requireActual('../../src/config/bootstrap');
  });
} finally {
  preloadEnvironmentFile.restore();
  process.env = initialEnvironment;
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No se pudo reservar el puerto de prueba.');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

interface ApplicationFixture {
  app: INestApplication;
  token: string;
  configuration: { get<T>(key: string): T | undefined };
  swaggerCreated: jest.SpyInstance;
  swaggerRegistered: jest.SpyInstance;
  listen: jest.SpyInstance;
}

async function controlledApplication(values: Record<string, string>, options: { security?: boolean; start?: boolean; dotenvContents?: string } = {}): Promise<ApplicationFixture> {
  let fixture: ApplicationFixture | undefined;
  await withEnvironment(values, async () => {
    await jest.isolateModulesAsync(async () => {
      const { Test } = await import('@nestjs/testing');
      const { ConfigService } = await import('@nestjs/config');
      const { SwaggerModule } = await import('@nestjs/swagger');
      const { AppModule } = await import('../../src/app.module');
      const { PrismaService } = await import('../../src/modules/business/infrastructure/prisma.service');
      const { PrismaIdentityService } = await import('../../src/modules/identity/infrastructure/prisma-identity.service');
      const { USER_BY_ID_LOOKUP } = await import('../../src/modules/identity/domain/user-by-id.lookup');
      const { MEMBERSHIP_REPOSITORY } = await import('../../src/modules/identity/domain/membership.repository');
      const { BUSINESS_REPOSITORY } = await import('../../src/modules/business/domain/business.repository');
      const { ACCESS_TOKEN_ISSUER } = await import('../../src/modules/identity/domain/access-token-issuer');
      const { User } = await import('../../src/modules/identity/domain/user.entity');
      const { UserStatus } = await import('../../src/modules/identity/domain/user-status.enum');
      const { configureApplication } = await import('../../src/config/configure-application');
      const { bootstrap } = await import('../../src/config/bootstrap');
      const user = User.create({ id: userId, email: 'startup@top.invalid', status: UserStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService).useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
        .overrideProvider(PrismaIdentityService).useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
        .overrideProvider(USER_BY_ID_LOOKUP).useValue({ findById: (id: string) => Promise.resolve(id === userId ? user : null) })
        .overrideProvider(MEMBERSHIP_REPOSITORY).useValue({ findByUserAndBusiness: () => Promise.resolve(null), findByUserId: () => Promise.resolve([]) })
        .overrideProvider(BUSINESS_REPOSITORY).useValue({ list: () => Promise.resolve([]) })
        .compile();
      const app = module.createNestApplication();
      const swaggerCreated = jest.spyOn(SwaggerModule, 'createDocument');
      const swaggerRegistered = jest.spyOn(SwaggerModule, 'setup');
      const listen = jest.spyOn(app, 'listen');
      if (options.start) {
        await bootstrap(() => Promise.resolve(app));
      } else {
        configureApplication(app, { security: options.security });
        await app.init();
      }
      const issuer = app.get<{ issue(payload: { sub: string }): Promise<{ token: string }> }>(ACCESS_TOKEN_ISSUER);
      fixture = { app, token: (await issuer.issue({ sub: userId })).token, configuration: app.get(ConfigService), swaggerCreated, swaggerRegistered, listen };
    });
  }, options.dotenvContents);
  if (!fixture) throw new Error('La aplicación de prueba no inició.');
  return fixture;
}

describe('Arranque real de producción', () => {
  afterEach(() => jest.restoreAllMocks());

  const unsafeTtl = '9007199254740991';
  const invalidRuntimeCases: Array<[string, string, string | undefined]> = [
    ['production', 'JWT_ACCESS_SECRET', undefined],
    ['test', 'JWT_ACCESS_SECRET', undefined],
    ['production', 'REFRESH_TOKEN_TTL_SECONDS', unsafeTtl],
    ['production', 'PASSWORD_RESET_TTL_SECONDS', unsafeTtl],
    ['production', 'PASSWORD_RESET_OTP_TTL_SECONDS', unsafeTtl],
    ['production', 'EMAIL_VERIFICATION_TTL_SECONDS', unsafeTtl],
  ];
  it.each(invalidRuntimeCases)('bootstrap predeterminado rechaza runtime inválido en %s para %s antes de importar Prisma o leer .env', async (mode, variable, value) => {
    const invalid = environment(mode);
    if (value === undefined) delete invalid[variable];
    else invalid[variable] = value;
    await withEnvironment(invalid, async (environmentFile) => {
      const prismaImported = jest.fn();
      jest.doMock('@prisma/client', () => { prismaImported(); throw new Error('Prisma no debe importarse con runtime inválido.'); });
      try {
        await jest.isolateModulesAsync(async () => {
          const { NestFactory } = await import('@nestjs/core');
          const { ExpressAdapter } = await import('@nestjs/platform-express');
          const { bootstrap } = await import('../../src/config/bootstrap');
          const create = jest.spyOn(NestFactory, 'create');
          const listen = jest.spyOn(ExpressAdapter.prototype, 'listen');
          const startup = bootstrap();
          await expect(startup).rejects.toThrow(variable);
          await expect(startup).rejects.not.toThrow(unsafeTtl);
          expect(create).not.toHaveBeenCalled();
          expect(listen).not.toHaveBeenCalled();
          expect(prismaImported).not.toHaveBeenCalled();
          expect(environmentFile.reads).not.toHaveBeenCalled();
          expect(process.env[variable]).toBe(value);
          expect(process.env.TOP_STARTUP_DOTENV_MARKER).toBeUndefined();
        });
      } finally {
        jest.dontMock('@prisma/client');
      }
    }, `JWT_ACCESS_SECRET=${productionSecret}\nSMTP_USER=file-only-user\nSMTP_PASSWORD=file-only-password\nTOP_STARTUP_DOTENV_MARKER=file-only-marker\n`);
  });

  it('bootstrap predeterminado rechaza un cliente Prisma con autoload .env antes de importarlo en producción', async () => {
    await withEnvironment(environment(), async (environmentFile) => {
      const metadataRead = jest.fn();
      const read = jest.mocked(fs.readFileSync);
      const originalRead = read.getMockImplementation();
      if (!originalRead) throw new Error('Falta el lector de archivos controlado.');
      const readArtifact = (file: fs.PathOrFileDescriptor, options?: unknown): string | Buffer => {
        if (String(file).replace(/\\/g, '/').endsWith('/.prisma/client/index.js')) {
          metadataRead();
          return 'const config = {"relativeEnvPaths":{"rootEnvPath":null,"schemaEnvPath":"../../../.env"}};';
        }
        return originalRead(file, options as BufferEncoding);
      };
      read.mockImplementation(readArtifact as typeof fs.readFileSync);
      const prismaImported = jest.fn();
      jest.doMock('@prisma/client', () => { prismaImported(); throw new Error('Prisma con autoload .env no debe importarse.'); });
      try {
        await jest.isolateModulesAsync(async () => {
          const { NestFactory } = await import('@nestjs/core');
          const { ExpressAdapter } = await import('@nestjs/platform-express');
          const { bootstrap } = await import('../../src/config/bootstrap');
          const create = jest.spyOn(NestFactory, 'create');
          const listen = jest.spyOn(ExpressAdapter.prototype, 'listen');
          await expect(bootstrap()).rejects.toThrow('PRISMA_CLIENT');
          expect(metadataRead).toHaveBeenCalledTimes(1);
          expect(create).not.toHaveBeenCalled();
          expect(listen).not.toHaveBeenCalled();
          expect(prismaImported).not.toHaveBeenCalled();
          expect(environmentFile.reads).not.toHaveBeenCalled();
          expect(process.env.TOP_STARTUP_DOTENV_MARKER).toBeUndefined();
        });
      } finally {
        jest.dontMock('@prisma/client');
      }
    });
  });

  it('AppModule conserva el snapshot runtime sin incorporar credenciales opcionales de un .env sintético', async () => {
    const fixture = await controlledApplication(environment(), { dotenvContents: 'SMTP_USER=file-only-user\nSMTP_PASSWORD=file-only-password\nTOP_STARTUP_DOTENV_MARKER=file-only-marker\n' });
    try {
      expect(fixture.configuration.get<string>('SMTP_USER')).toBeUndefined();
      expect(fixture.configuration.get<string>('SMTP_PASSWORD')).toBeUndefined();
      expect(fixture.configuration.get<string>('TOP_STARTUP_DOTENV_MARKER')).toBeUndefined();
      expect(fixture.configuration.get<string>('JWT_ACCESS_SECRET')).toBe(productionSecret);
      await request(fixture.app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    } finally {
      await fixture.app.close();
    }
  });

  it('rechaza configuración incompleta antes de listen mediante AppModule y bootstrap', async () => {
    const invalid = environment();
    delete invalid.JWT_ACCESS_SECRET;
    await withEnvironment(invalid, async () => {
      await jest.isolateModulesAsync(async () => {
        const { Test } = await import('@nestjs/testing');
        const { ExpressAdapter } = await import('@nestjs/platform-express');
        const { bootstrap } = await import('../../src/config/bootstrap');
        const listen = jest.spyOn(ExpressAdapter.prototype, 'listen');
        const createApplication = async (): Promise<INestApplication> => {
          const { AppModule } = await import('../../src/app.module');
          const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
          return module.createNestApplication();
        };
        await expect(bootstrap(createApplication)).rejects.toThrow('JWT_ACCESS_SECRET');
        expect(listen).not.toHaveBeenCalled();
      });
    });
  });

  it('escucha HTTP con configuración válida y conserva la configuración validada tras cambiar el entorno', async () => {
    const port = await unusedPort();
    const fixture = await controlledApplication(environment('production', String(port)), { start: true });
    const original = process.env;
    try {
      expect(fixture.listen).toHaveBeenCalledWith(port);
      process.env = { ...original, PORT: '1', JWT_ACCESS_SECRET: 'unexpected-short-secret', CORS_ORIGIN: 'https://unapproved.example' };
      expect(fixture.configuration.get<number>('PORT')).toBe(port);
      expect(fixture.configuration.get<string>('JWT_ACCESS_SECRET')).toBe(productionSecret);
      await request(fixture.app.getHttpServer()).get('/api/health').set('Origin', allowedOrigin).expect('Access-Control-Allow-Origin', allowedOrigin).expect(200, { status: 'ok' });
      await request(fixture.app.getHttpServer()).get('/api/businesses').set('Authorization', `Bearer ${fixture.token}`).expect(200, []);
    } finally {
      process.env = original;
      await fixture.app.close();
    }
  });

  it.each(['*', 'null', 'https://app.top.invalid/path', `${allowedOrigin},`])('rechaza CORS inválido al crear AppModule: %s', async (origin) => {
    await withEnvironment({ ...environment(), CORS_ORIGIN: origin }, async () => {
      await jest.isolateModulesAsync(async () => {
        const { Test } = await import('@nestjs/testing');
        const { AppModule } = await import('../../src/app.module');
        await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrow('CORS_ORIGIN');
      });
    });
  });
});

describe('CORS explícito y guards en producción', () => {
  let fixture: ApplicationFixture;
  beforeAll(async () => { fixture = await controlledApplication(environment()); });
  afterAll(async () => { await fixture.app.close(); jest.restoreAllMocks(); });

  it.each([allowedOrigin, secondaryOrigin])('autoriza únicamente el origen completo configurado: %s', async (origin) => {
    await request(fixture.app.getHttpServer()).get('/api/health').set('Origin', origin).expect('Access-Control-Allow-Origin', origin).expect(200);
  });

  it('preserva preflight, Authorization e Idempotency-Key para las mutaciones', async () => {
    const response = await request(fixture.app.getHttpServer())
      .options(`/api/businesses/${businessId}/bookings`)
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key')
      .expect(204)
      .expect('Access-Control-Allow-Origin', allowedOrigin);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    const headers = String(response.headers['access-control-allow-headers']).toLowerCase().split(',').map((value) => value.trim());
    expect(headers).toEqual(expect.arrayContaining(['authorization', 'content-type', 'idempotency-key']));
  });

  it.each(['https://foreign.invalid', 'https://app.top.invalid.attacker.invalid', 'https://sub.app.top.invalid', 'http://app.top.invalid', 'https://app.top.invalid:8443', 'null'])('no concede CORS ni falla con 500 para un origen ajeno: %s', async (origin) => {
    const response = await request(fixture.app.getHttpServer()).get('/api/health').set('Origin', origin).expect(200);
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    const preflight = await request(fixture.app.getHttpServer()).options('/api/health').set('Origin', origin).set('Access-Control-Request-Method', 'GET');
    expect(preflight.status).toBeLessThan(500);
    expect(preflight.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('mantiene solicitudes sin Origin y exige JWT y Membership independientemente de CORS', async () => {
    const response = await request(fixture.app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    for (const origin of [undefined, allowedOrigin, 'https://foreign.example']) {
      const unauthenticated = request(fixture.app.getHttpServer()).get(`/api/businesses/${businessId}`);
      if (origin) unauthenticated.set('Origin', origin);
      await unauthenticated.expect(401);
      const unauthorized = request(fixture.app.getHttpServer()).get(`/api/businesses/${businessId}`).set('Authorization', `Bearer ${fixture.token}`);
      if (origin) unauthorized.set('Origin', origin);
      await unauthorized.expect(403);
    }
  });
});

describe('Swagger por entorno', () => {
  afterEach(() => jest.restoreAllMocks());

  it('no genera ni registra UI, JSON o YAML en producción aun sin guards', async () => {
    const fixture = await controlledApplication(environment(), { security: false });
    try {
      expect(fixture.swaggerCreated).not.toHaveBeenCalled();
      expect(fixture.swaggerRegistered).not.toHaveBeenCalled();
      for (const path of ['/api/docs', '/api/docs/', '/api/docs-json', '/api/docs-yaml', '/api/docs/swagger-ui-init.js']) {
        await request(fixture.app.getHttpServer()).get(path).expect(404);
      }
      await request(fixture.app.getHttpServer()).get('/api/health').expect(200);
    } finally {
      await fixture.app.close();
    }
  });

  it.each(['development', 'test'])('conserva UI, JSON y YAML en %s', async (mode) => {
    const fixture = await controlledApplication(environment(mode));
    try {
      expect(fixture.swaggerCreated).toHaveBeenCalledTimes(1);
      expect(fixture.swaggerRegistered).toHaveBeenCalledTimes(1);
      await request(fixture.app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
      const json = await request(fixture.app.getHttpServer()).get('/api/docs-json').expect(200);
      expect(json.body.paths).toHaveProperty('/api/health');
      await request(fixture.app.getHttpServer()).get('/api/docs-yaml').expect(200).expect(({ text }) => expect(text).toContain('openapi:'));
      await request(fixture.app.getHttpServer()).get('/api/businesses').expect(401);
    } finally {
      await fixture.app.close();
    }
  });
});
