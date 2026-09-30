// Ejecutar desde cualquier directorio: node backend/test/packaging/production-image.smoke.mjs
// Docker requerido. Solo crea recursos desechables propios; conserva la imagen para otros gates.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { cp, mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';

const backend = fileURLToPath(new URL('../../', import.meta.url));
const id = randomUUID().replaceAll('-', '');
const image = `top-production-startup-smoke:${id}`;
const network = `top-production-smoke-${id}`;
const database = `top-production-db-${id}`;
const application = `top-production-api-${id}`;
const localApplication = `top-development-api-${id}`;
const temporary = await mkdtemp(join(tmpdir(), 'top-production-packaging-'));
const context = join(temporary, 'context');
const sentinel = `TOP_SYNTHETIC_PRIVATE_${id}`;
const fixtures = [
  '.env', '.env.production', '.env.staging.local', '.env-secret', '.envrc', '.npmrc', '.netrc',
  '.aws/credentials', '.azure/accessTokens.json', '.ssh/id_rsa', '.config/gcloud/token',
  'credentials.json', 'cloud/service-account.json', 'cloud/service_account.json',
  'cloud/private.credentials.json', 'nested/.env.local', 'nested/secrets/token',
  'nested/private.key', 'nested/private.pem', 'nested/private.p8', 'nested/private.p12', 'nested/private.pfx',
  'nested/private.jks', 'nested/private.keystore',
];
const cleanup = [];

function docker(args, { allowFailure = false, inherit = false } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Docker ${args[0]} falló (${result.status}): ${result.stderr ?? ''}`);
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(predicate, description) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (predicate()) return;
    await delay(500);
  }
  throw new Error(`Timeout esperando ${description}.`);
}

function sourceIsSafe(path) {
  const name = basename(path);
  // No copiar configuración privada real al contexto temporal. Las fixtures
  // se escriben después y prueban .dockerignore con datos sintéticos.
  if (/^\.env(?:$|[.-])/.test(name) || ['.envrc', '.npmrc', '.netrc'].includes(name)) return false;
  if (/\.(?:key|pem|p8|p12|pfx|jks|keystore)$/.test(name)) return false;
  if (/credentials.*\.json$|service[-_]account.*\.json$/.test(name)) return false;
  return !['node_modules', 'dist', '.git', 'coverage', 'reports', 'tmp', 'temp',
    '.stryker-tmp', 'stryker-tmp', '.aws', '.azure', '.ssh', 'gcloud', 'secrets'].includes(name);
}

async function assertLayersExcludeSentinel(path) {
  const needle = Buffer.from(sentinel);
  const archive = await open(path, 'r');
  try {
    let offset = 0;
    const header = Buffer.alloc(512);
    while ((await archive.read(header, 0, 512, offset)).bytesRead === 512 && header.some((byte) => byte !== 0)) {
      const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8) || 0;
      const start = offset + 512;
      if (size > 0) {
        const signature = Buffer.alloc(4);
        await archive.read(signature, 0, Math.min(4, size), start);
        let stream = createReadStream(path, { start, end: start + size - 1 });
        // Docker puede exportar layers OCI comprimidas. Comprobar también
        // contenido descomprimido, no solo buscar texto dentro del tar externo.
        if (signature[0] === 0x1f && signature[1] === 0x8b) stream = stream.pipe(zlib.createGunzip());
        if (signature.equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))) {
          assert.equal(typeof zlib.createZstdDecompress, 'function', 'La imagen usa zstd; ejecutar este smoke con Node 22 actualizado.');
          stream = stream.pipe(zlib.createZstdDecompress());
        }
        let trailing = Buffer.alloc(0);
        for await (const chunk of stream) {
          const combined = Buffer.concat([trailing, chunk]);
          assert.equal(combined.includes(needle), false, 'Una capa contiene la fixture sensible.');
          trailing = combined.subarray(Math.max(0, combined.length - needle.length));
        }
      }
      offset = start + Math.ceil(size / 512) * 512;
    }
  } finally {
    await archive.close();
  }
}

function httpProbe(path, headers = {}, method = 'GET', container = application) {
  const script = `fetch('http://127.0.0.1:3000${path}', {method:${JSON.stringify(method)},headers:${JSON.stringify(headers)}}).then(async r => {console.log(JSON.stringify({status:r.status,cors:r.headers.get('access-control-allow-origin'),body:await r.text()}))}).catch(() => process.exit(1))`;
  const result = docker(['exec', container, 'node', '-e', script], { allowFailure: true });
  if (result.status !== 0) return undefined;
  return JSON.parse(result.stdout);
}

try {
  docker(['version', '--format', '{{.Server.Version}}']);
  const compose = JSON.parse(docker(['compose', '--project-name', `top-check-${id}`,
    '--env-file', join(backend, '.env.example'), '-f', join(backend, 'docker-compose.yml'),
    'config', '--format', 'json']).stdout);
  assert.equal(compose.services.api.environment.NODE_ENV, 'development');
  assert.equal(compose.services.api.environment.EMAIL_DELIVERY_MODE, 'console');
  assert.equal(compose.services.api.environment.S3_BUCKET, 'top-resource-images');
  assert.deepEqual(Object.keys(compose.volumes).sort(), ['minio_data', 'postgres_data']);
  console.log('PASS Compose local: desarrollo, console, bucket y volúmenes conservados (config solamente).');

  await cp(backend, context, { recursive: true, filter: sourceIsSafe });
  for (const fixture of fixtures) {
    const path = join(context, fixture);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, sentinel);
  }
  console.log('Construyendo imagen con fixtures sensibles sintéticas en un contexto temporal.');
  docker(['build', '--tag', image, context], { inherit: true });
  const configuredEnvironment = JSON.parse(docker(['image', 'inspect', image,
    '--format', '{{json .Config.Env}}']).stdout);
  assert.ok(configuredEnvironment.includes('NODE_ENV=production'));
  assert.equal(docker(['run', '--rm', image, 'node', '-p', 'process.env.NODE_ENV']).stdout.trim(), 'production');
  const fileCheck = `const fs=require('node:fs'); const paths=${JSON.stringify(fixtures)}; if(paths.some(p=>fs.existsSync('/app/'+p))) process.exit(1);`;
  docker(['run', '--rm', image, 'node', '-e', fileCheck]);
  const savedImage = join(temporary, 'image.tar');
  docker(['image', 'save', '--output', savedImage, image]);
  await assertLayersExcludeSentinel(savedImage);
  await rm(savedImage);
  console.log('PASS imagen: NODE_ENV=production en configuración y runtime; fixtures ausentes del filesystem y de las capas.');

  const invalid = docker(['run', '--rm', image], { allowFailure: true });
  assert.notEqual(invalid.status, 0, 'Configuración ausente debe terminar el arranque.');
  assert.match(invalid.stdout + invalid.stderr, /Configuración inválida|configuration|JWT_ACCESS_SECRET|DATABASE_URL/i);
  assert.doesNotMatch(invalid.stdout + invalid.stderr, /Nest application successfully started/);
  console.log('PASS arranque real: producción sin configuración sale con error antes de listen.');

  const dotenvScript = `require('node:fs').writeFileSync('.env', ${JSON.stringify(`JWT_ACCESS_SECRET=${sentinel}\nDOTENV_PRIVATE_MARKER=${sentinel}\n`)});require('./dist/src/main.js');`;
  const runtimeDotenv = docker(['run', '--rm', image, 'node', '-e', dotenvScript], { allowFailure: true });
  assert.notEqual(runtimeDotenv.status, 0);
  assert.match(runtimeDotenv.stdout + runtimeDotenv.stderr, /JWT_ACCESS_SECRET/);
  assert.equal((runtimeDotenv.stdout + runtimeDotenv.stderr).includes(sentinel), false);
  assert.doesNotMatch(runtimeDotenv.stdout + runtimeDotenv.stderr, /Nest application successfully started/);
  console.log('PASS runtime: producción ignora .env presente físicamente y errores/logs excluyen su marker sensible.');

  docker(['network', 'create', network]);
  cleanup.push(['network', 'rm', network]);
  docker(['run', '--detach', '--name', database, '--network', network,
    '--tmpfs', '/var/lib/postgresql/data', '--env', 'POSTGRES_USER=top',
    '--env', 'POSTGRES_PASSWORD=smoke-postgres-password', '--env', 'POSTGRES_DB=top_test',
    'postgres:16-alpine']);
  cleanup.push(['rm', '--force', database]);
  await waitUntil(() => docker(['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'top', '-d', 'top_test'],
    { allowFailure: true }).status === 0, 'PostgreSQL desechable');
  const env = {
    DATABASE_URL: `postgresql://top:smoke-postgres-password@${database}:5432/top_test?schema=public`,
    PORT: '3000', JWT_ACCESS_SECRET: 'd013aab651eeca17b1185147cd8a7b837',
    PASSWORD_RESET_OTP_SECRET: '20151c540cc68f9dd9dcab4fa98685641',
    APP_PUBLIC_URL: 'https://app.top.invalid', CORS_ORIGIN: 'https://app.top.invalid',
    EMAIL_DELIVERY_MODE: 'smtp', SMTP_HOST: 'smtp.invalid', SMTP_PORT: '587',
    SMTP_FROM: 'TOP <no-reply@top.invalid>', S3_ENDPOINT: 'https://storage.invalid',
    S3_REGION: 'us-east-1', S3_BUCKET: 'top-resource-images',
    S3_ACCESS_KEY: 'smoke-access-key', S3_SECRET_KEY: 'smoke-storage-key', S3_FORCE_PATH_STYLE: 'true',
  };
  const environmentArguments = Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const invalidPublicUrl = { ...env, APP_PUBLIC_URL: `https://user:${sentinel}@app.top.invalid` };
  const invalidUrlArguments = Object.entries(invalidPublicUrl).flatMap(([key, value]) => ['--env', `${key}=${value}`]);
  const invalidUrl = docker(['run', '--rm', ...invalidUrlArguments, image], { allowFailure: true });
  assert.notEqual(invalidUrl.status, 0);
  assert.match(invalidUrl.stdout + invalidUrl.stderr, /APP_PUBLIC_URL/);
  assert.equal((invalidUrl.stdout + invalidUrl.stderr).includes(sentinel), false);
  assert.doesNotMatch(invalidUrl.stdout + invalidUrl.stderr, /Nest application successfully started/);
  console.log('PASS logs de arranque: URL inválida con credencial sintética no expone su valor.');
  docker(['run', '--rm', '--network', network, ...environmentArguments,
    image, 'npx', 'prisma', 'migrate', 'deploy']);
  docker(['run', '--detach', '--name', application, '--network', network,
    ...environmentArguments, image]);
  cleanup.push(['rm', '--force', application]);
  await waitUntil(() => httpProbe('/api/health')?.status === 200, 'API de producción');
  assert.equal(httpProbe('/api/health').status, 200);
  const allowed = httpProbe('/api/health', { Origin: env.CORS_ORIGIN });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.cors, env.CORS_ORIGIN);
  const denied = httpProbe('/api/health', { Origin: 'https://foreign.top.invalid' });
  assert.equal(denied.status, 200);
  assert.equal(denied.cors, null);
  const preflight = httpProbe('/api/businesses', {
    Origin: env.CORS_ORIGIN, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
  }, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.cors, env.CORS_ORIGIN);
  assert.equal(httpProbe('/api/businesses').status, 401);
  assert.equal(httpProbe('/api/businesses', { Origin: env.CORS_ORIGIN }).status, 401);
  console.log('PASS smoke: HTTP health, CORS permitido/ajeno/preflight/sin Origin y guards; sin enviar correo ni conectar a storage.');
  docker(['run', '--detach', '--name', localApplication, '--network', network,
    '--env', 'NODE_ENV=development', '--env', `DATABASE_URL=${env.DATABASE_URL}`,
    '--env', 'JWT_ACCESS_SECRET=top-local-development-secret-change-in-production',
    '--env', 'EMAIL_DELIVERY_MODE=console', '--env', 'CORS_ORIGIN=http://localhost:3001', image]);
  cleanup.push(['rm', '--force', localApplication]);
  await waitUntil(() => httpProbe('/api/health', {}, 'GET', localApplication)?.status === 200, 'API local de desarrollo');
  assert.equal(httpProbe('/api/docs', {}, 'GET', localApplication).status, 200);
  assert.equal(httpProbe('/api/docs-json', {}, 'GET', localApplication).status, 200);
  assert.equal(httpProbe('/api/docs-yaml', {}, 'GET', localApplication).status, 200);
  assert.equal(httpProbe('/api/health', { Origin: 'http://localhost:3001' }, 'GET', localApplication).cors, 'http://localhost:3001');
  console.log('PASS desarrollo real: console sin SMTP configurado, storage en memoria permitido, Swagger UI/JSON/YAML y origen HTTP local.');
  console.log(`PASS PostgreSQL efímero top_test; sin puertos publicados ni volúmenes persistentes. Imagen conservada: ${image}`);
} finally {
  for (const args of cleanup.reverse()) docker(args, { allowFailure: true });
  await rm(temporary, { recursive: true, force: true });
}
