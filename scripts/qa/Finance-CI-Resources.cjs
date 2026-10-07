'use strict';

// Sólo CI Ubuntu/Node22: dos contenedores nuevos, datos efímeros y ownership exacto.
// No instala dependencias, reutiliza recursos ni imprime URLs/credenciales.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');

const PG_IMAGE = 'postgres:16-alpine';
// La imagen fijada no está disponible en CI; binario upstream estático verificado, sin mirrors ni latest.
const MINIO_BINARY_SHA = '7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f';
const MINIO_BINARY_SIZE = 110989496;
const MINIO_BINARY_URL = 'https://github.com/minio/minio/releases/download/RELEASE.2025-09-07T16-13-09Z/minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z';
const MINIO_IMAGE = 'top-finance-ci-minio:sha256-' + MINIO_BINARY_SHA;
const PG_ACTOR = 'top_night_test';
const MAIN_DB = 'top_test';
const RESTORE_DB = 'top_finance_files_restore_test';
const PG_PORT = 55473;
const S3_PORT = 45677;
const PURPOSE = 'fin032-ci-resources-v1';
const FULL_ID = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const OWNER_ID = /^[a-f0-9]{32}$/;
class ResourcesError extends Error {
  constructor(message, details = {}) { super(message); this.details = details; }
}
const PHASES = ['context', 'ports', 'image-pull', 'creation', 'readiness', 'databases', 'buckets', 'export', 'cleanup'];
const RESOURCES = ['none', 'postgres', 'minio'];
const OPERATIONS = ['pull', 'build', 'create', 'inspect', 'start', 'exec', 'rm'];
const DATABASE_STEPS = Object.freeze(['main-identity', 'restore-create', 'restore-identity']);
const ERROR_CODES = ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', 'EADDRINUSE', 'ECONNREFUSED', 'ECONNRESET',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'EIO', 'ENOSPC', 'AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch',
  'NoSuchBucket', 'NoSuchBucketPolicy', 'BucketAlreadyExists', 'BucketAlreadyOwnedByYou', 'InvalidBucketName',
  'AuthorizationHeaderMalformed', 'RequestTimeout', 'ServiceUnavailable', 'SlowDown', 'TimeoutError', 'AbortError'];
const SIGNALS = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV'];
const REASONS = ['docker-failed', 'manifest-unknown', 'image-unavailable', 'platform-unavailable', 'daemon-unavailable',
  'permission-denied', 'port-in-use', 'read-only-filesystem', 'rate-limited', 'readiness-timeout', 'guard-rejected', 'external-error',
  'bucket-acl-not-private', 'bucket-policy-present', 'bucket-sentinel-mismatch', 'bucket-anonymous-status'];
const permitted = (value, choices, fallback = null) => choices.includes(value) ? value : fallback;
function failureDiagnostic(phase, resource, error) {
  const details = error instanceof ResourcesError ? error.details : {};
  // Sólo enums y números acotados. Nunca mensajes, nombres libres, args, URLs ni objetos externos.
  const diagnostic = {
    phase: permitted(phase, PHASES, 'context'), resource: permitted(resource, RESOURCES, 'none'),
    operation: permitted(details.operation, OPERATIONS),
    exitCode: Number.isInteger(details.exitCode) && details.exitCode >= 0 && details.exitCode <= 255 ? details.exitCode : null,
    errorCode: permitted(details.errorCode, ERROR_CODES) ?? permitted(error?.code, ERROR_CODES) ?? permitted(error?.name, ERROR_CODES),
    signal: permitted(details.signal, SIGNALS),
    reason: permitted(details.reason, REASONS, error instanceof ResourcesError ? 'guard-rejected' : 'external-error'),
    httpStatus: Number.isInteger(details.httpStatus) && details.httpStatus >= 100 && details.httpStatus <= 599 ? details.httpStatus
      : Number.isInteger(error?.$metadata?.httpStatusCode) && error.$metadata.httpStatusCode >= 100 && error.$metadata.httpStatusCode <= 599
        ? error.$metadata.httpStatusCode : null,
  };
  const step = permitted(details.step, DATABASE_STEPS);
  if (diagnostic.phase === 'databases' && diagnostic.resource === 'postgres' && step) diagnostic.step = step;
  if (details.cleanup?.status === 'complete') diagnostic.cleanup = { status: 'complete' };
  else if (details.cleanup?.status === 'failed') {
    const cleanupDetails = { ...details.cleanup }; delete cleanupDetails.cleanup;
    diagnostic.cleanup = { status: 'failed', ...failureDiagnostic('cleanup', details.cleanup.resource, new ResourcesError('', cleanupDetails)) };
  }
  return diagnostic;
}
function dockerFailure(operation, result) {
  // Clasificación cerrada del stderr; el texto original jamás sale del proceso.
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const reason = /manifest unknown|manifest.*not found/i.test(stderr) ? 'manifest-unknown'
    : /no matching manifest|no match for platform/i.test(stderr) ? 'platform-unavailable'
      : /pull access denied|repository does not exist/i.test(stderr) ? 'image-unavailable'
        : /cannot connect to the docker daemon|is the docker daemon running/i.test(stderr) ? 'daemon-unavailable'
          : /permission denied|access denied/i.test(stderr) ? 'permission-denied'
            : /port is already allocated|address already in use/i.test(stderr) ? 'port-in-use'
              : /read-only file system/i.test(stderr) ? 'read-only-filesystem'
                : /toomanyrequests|too many requests|pull rate limit/i.test(stderr) ? 'rate-limited' : 'docker-failed';
  return new ResourcesError('Falló una operación Docker del recurso propio.', {
    operation: permitted(operation, OPERATIONS), exitCode: result.status,
    errorCode: permitted(result.error?.code, ERROR_CODES), signal: permitted(result.signal, SIGNALS), reason,
  });
}

function required(name) {
  const value = process.env[name];
  if (!value || /[\r\n\0]/.test(value)) throw new ResourcesError('Falta una variable de control CI válida.');
  return value;
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function context() {
  if (process.platform !== 'linux' || process.versions.node.split('.')[0] !== '22'
    || process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
    throw new ResourcesError('Se requiere exclusivamente GitHub CI Ubuntu con Node22.');
  }
  if ((process.env.DOCKER_HOST && process.env.DOCKER_HOST !== 'unix:///var/run/docker.sock')
    || (process.env.DOCKER_CONTEXT && process.env.DOCKER_CONTEXT !== 'default') || process.env.DOCKER_TLS_VERIFY) {
    throw new ResourcesError('CI sólo admite Docker local; no se usa un daemon remoto.');
  }
  const repo = fs.realpathSync(path.resolve(__dirname, '..', '..'));
  if (fs.realpathSync(required('GITHUB_WORKSPACE')) !== repo) throw new ResourcesError('Checkout CI no coincide con el helper.');
  const runId = required('GITHUB_RUN_ID'), attempt = required('GITHUB_RUN_ATTEMPT'), job = required('GITHUB_JOB');
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(attempt) || !/^[a-zA-Z0-9_-]{1,100}$/.test(job)) throw new ResourcesError('Identidad CI inválida.');
  const temp = fs.realpathSync(required('RUNNER_TEMP'));
  const envFile = path.resolve(required('GITHUB_ENV'));
  if (!inside(temp, envFile) || fs.realpathSync(path.dirname(envFile)) !== path.dirname(envFile)) throw new ResourcesError('Archivo de entorno CI fuera de su scratch propio.');
  const stateFile = path.join(temp, `top-finance-ci-${runId}-${attempt}-${job}.json`);
  return { repo, temp, envFile, stateFile, runId, attempt, job };
}
function descriptor(ctx, ownerId, kind) {
  const postgres = kind === 'postgres';
  return {
    kind, name: `top-finance-ci-${postgres ? 'pg' : 's3'}-${ownerId}`,
    image: postgres ? PG_IMAGE : MINIO_IMAGE,
    cidFile: path.join(ctx.temp, `top-finance-ci-${ownerId}-${kind}.cid`),
    containerId: null, imageId: null,
    containerPort: postgres ? '5432/tcp' : '9000/tcp',
    hostPort: String(postgres ? PG_PORT : S3_PORT),
    tmpfs: postgres ? { '/var/lib/postgresql/data': 'rw,size=512m', '/tmp': 'rw,size=128m' }
      : { '/data': 'rw,size=512m', '/tmp': 'rw,size=64m' },
  };
}
function persist(ctx, state, initial = false) {
  const body = JSON.stringify(state) + '\n';
  if (initial) return fs.writeFileSync(ctx.stateFile, body, { flag: 'wx', mode: 0o600 });
  const next = ctx.stateFile + '.' + state.ownerId + '.next';
  fs.writeFileSync(next, body, { flag: 'wx', mode: 0o600 });
  fs.renameSync(next, ctx.stateFile);
}
function ownState(ctx) {
  if (!fs.existsSync(ctx.stateFile)) return null;
  if (!fs.lstatSync(ctx.stateFile).isFile()) throw new ResourcesError('Estado CI no es un archivo propio regular.');
  const state = JSON.parse(fs.readFileSync(ctx.stateFile, 'utf8'));
  if (state.version !== 1 || !OWNER_ID.test(state.ownerId) || state.runId !== ctx.runId
    || state.attempt !== ctx.attempt || state.job !== ctx.job || state.purpose !== PURPOSE
    || !Array.isArray(state.resources) || state.resources.length !== 2) throw new ResourcesError('Estado CI no coincide con esta ejecución.');
  for (const [index, kind] of ['postgres', 'minio'].entries()) {
    const actual = state.resources[index], expected = descriptor(ctx, state.ownerId, kind);
    if (!actual || (actual.containerId !== null && !FULL_ID.test(actual.containerId))) throw new ResourcesError('ID CI no es completo.');
    if (actual.imageId !== null && (kind !== 'minio' || !IMAGE_ID.test(actual.imageId))) throw new ResourcesError('ID de imagen CI no corresponde a la construcción propia.');
    for (const key of ['kind', 'name', 'image', 'cidFile', 'containerPort', 'hostPort']) {
      if (actual[key] !== expected[key]) throw new ResourcesError('Metadata CI no corresponde al recurso propio esperado.');
    }
    if (JSON.stringify(actual.tmpfs) !== JSON.stringify(expected.tmpfs)) throw new ResourcesError('Almacenamiento CI no coincide.');
  }
  return state;
}
function dockerResult(args, env = {}, timeout = 10000, input) {
  return spawnSync('docker', args, { encoding: 'utf8', shell: false, timeout,
    maxBuffer: 4 * 1024 * 1024, input, env: { ...process.env, ...env } });
}
function docker(args, env = {}, timeout = 10000, input) {
  const result = dockerResult(args, env, timeout, input);
  if (result.error || result.status !== 0) throw dockerFailure(args[0], result);
  return result.stdout.trim();
}
function minioArchive(binary) {
  // Contexto tar sólo en memoria, dos entradas fijas; no rutas del checkout ni secretos.
  const entry = (name, bytes, mode) => {
    const header = Buffer.alloc(512);
    const octal = (value, width) => value.toString(8).padStart(width - 1, '0') + '\0';
    header.write(name); header.write(octal(mode, 8), 100); header.write(octal(0, 8), 108);
    header.write(octal(0, 8), 116); header.write(octal(bytes.length, 12), 124);
    header.write(octal(0, 12), 136); header.fill(32, 148, 156); header.write('0', 156);
    header.write('ustar\0', 257); header.write('00', 263);
    header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
  };
  const dockerfile = Buffer.from('FROM scratch\nCOPY minio /usr/bin/minio\nENTRYPOINT ["/usr/bin/minio"]\n');
  return Buffer.concat([entry('Dockerfile', dockerfile, 0o644), entry('minio', binary, 0o755), Buffer.alloc(1024)]);
}
async function buildMinioImage() {
  const response = await fetch(MINIO_BINARY_URL, { signal: AbortSignal.timeout(120000) });
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new ResourcesError('No se pudo descargar el binario oficial fijado.', { httpStatus: response.status });
  }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MINIO_BINARY_SIZE) throw new ResourcesError('El binario oficial excede el tamaño fijado.');
    chunks.push(chunk);
  }
  const binary = Buffer.concat(chunks);
  if (size !== MINIO_BINARY_SIZE || createHash('sha256').update(binary).digest('hex') !== MINIO_BINARY_SHA) {
    throw new ResourcesError('El binario oficial no coincide con tamaño y SHA256 fijados.');
  }
  const id = docker(['build', '--platform', 'linux/amd64', '--no-cache', '--quiet', '--tag', MINIO_IMAGE, '-'], {}, 180000, minioArchive(binary));
  if (!IMAGE_ID.test(id)) throw new ResourcesError('La construcción propia no devolvió un ID de imagen completo.');
  return id;
}
function inspection(reference, allowMissing = false) {
  const result = dockerResult(['inspect', reference]);
  if (result.error) throw dockerFailure('inspect', result);
  if (result.status !== 0) {
    if (allowMissing && /No such (?:object|container)/i.test(result.stderr)) return null;
    throw dockerFailure('inspect', result);
  }
  const values = JSON.parse(result.stdout);
  if (!Array.isArray(values) || values.length !== 1 || !FULL_ID.test(values[0]?.Id)) throw new ResourcesError('Inspección Docker no identifica exactamente un contenedor.');
  return values[0];
}
function labels(ctx, state, item) {
  const result = {
    'top.finance.qa.owner': state.ownerId, 'top.finance.ci.purpose': PURPOSE,
    'top.finance.ci.run': ctx.runId, 'top.finance.ci.attempt': ctx.attempt,
    'top.finance.ci.job': ctx.job, 'top.finance.ci.kind': item.kind,
  };
  if (item.kind === 'postgres') result['top.portable.qa.run'] = state.ownerId;
  else result['top.finance.qa.purpose'] = 'synthetic-private-files';
  return result;
}
function sameOptions(actual, expected) {
  const keys = Object.keys(actual ?? {}).sort(), expectedKeys = Object.keys(expected).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}
function attest(ctx, state, item, current, running = false) {
  if (!current || !FULL_ID.test(current.Id) || (item.containerId && current.Id !== item.containerId)
    || current.Name !== '/' + item.name || current.Config?.Image !== item.image) throw new ResourcesError('Ownership o imagen Docker no coinciden.');
  if (item.kind === 'minio' && (!IMAGE_ID.test(item.imageId) || current.Image !== item.imageId)) throw new ResourcesError('El contenedor no usa el ID de imagen MinIO construido y verificado.');
  for (const [key, value] of Object.entries(labels(ctx, state, item))) {
    if (current.Config.Labels?.[key] !== value) throw new ResourcesError('Labels de ownership Docker no coinciden.');
  }
  const host = current.HostConfig;
  if (!host?.AutoRemove || host.Privileged || !['default', 'bridge'].includes(host.NetworkMode)
    || Boolean(host.ReadonlyRootfs) !== (item.kind === 'minio')) throw new ResourcesError('Topología Docker fuera del contrato efímero.');
  if (!sameOptions(host.Tmpfs, item.tmpfs) || !Array.isArray(current.Mounts) || host.Binds?.length || host.Mounts?.length
    || current.Mounts.some(mount => mount.Type !== 'tmpfs' || !(mount.Destination in item.tmpfs))) throw new ResourcesError('Docker tiene mounts persistentes o no autorizados.');
  const bindings = Object.entries(host.PortBindings ?? {}).filter(([, values]) => values?.length);
  if (bindings.length !== 1 || bindings[0][0] !== item.containerPort || bindings[0][1].length !== 1
    || bindings[0][1][0].HostIp !== '127.0.0.1' || bindings[0][1][0].HostPort !== item.hostPort) throw new ResourcesError('Puertos Docker no son el loopback propio reservado.');
  if (running && !current.State?.Running) throw new ResourcesError('Contenedor propio no está ejecutándose.');
}
function readCid(item) {
  if (!fs.existsSync(item.cidFile)) return null;
  if (!fs.lstatSync(item.cidFile).isFile()) throw new ResourcesError('CID propio no es un archivo regular.');
  const id = fs.readFileSync(item.cidFile, 'utf8').trim();
  if (!FULL_ID.test(id) || (item.containerId && id !== item.containerId)) throw new ResourcesError('CID no coincide con el ID completo registrado.');
  return id;
}
async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', error => reject(new ResourcesError('Puerto CI reservado ocupado; no se reutiliza ni detiene otro servicio.', { errorCode: permitted(error?.code, ERROR_CODES) })));
    server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(new ResourcesError('No se pudo liberar la comprobación de puerto CI.', { errorCode: permitted(error?.code, ERROR_CODES) })) : resolve()));
  });
}
function createContainer(ctx, state, item, credentials) {
  const args = ['create', '--pull', 'never', '--platform', 'linux/amd64', '--rm', '--name', item.name, '--cidfile', item.cidFile];
  for (const [key, value] of Object.entries(labels(ctx, state, item))) args.push('--label', key + '=' + value);
  for (const [destination, options] of Object.entries(item.tmpfs)) args.push('--tmpfs', destination + ':' + options);
  args.push('--publish', '127.0.0.1:' + item.hostPort + ':' + item.containerPort.split('/')[0]);
  if (item.kind === 'postgres') {
    args.push('--env', 'POSTGRES_USER', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB',
      '--health-cmd', `pg_isready -U ${PG_ACTOR} -d ${MAIN_DB}`, '--health-interval', '1s',
      '--health-timeout', '3s', '--health-retries', '40', item.image);
  } else {
    args.push('--read-only', '--env', 'MINIO_ROOT_USER', '--env', 'MINIO_ROOT_PASSWORD', item.image,
      'server', '/data', '--address', ':9000', '--console-address', ':9001', '--config-dir', '/tmp/finance-minio-config');
  }
  const id = docker(args, credentials, 30000);
  if (!FULL_ID.test(id) || readCid(item) !== id) throw new ResourcesError('Docker create no entregó el CID propio completo.');
  item.containerId = id; persist(ctx, state);
  attest(ctx, state, item, inspection(id));
  docker(['start', id]);
}
async function ready(ctx, state, item) {
  const deadline = Date.now() + 90000;
  let lastObservation = {};
  while (Date.now() < deadline) {
    const current = inspection(item.containerId); attest(ctx, state, item, current, true);
    if (item.kind === 'postgres' && current.State.Health?.Status === 'healthy') return;
    if (item.kind === 'minio') {
      try {
        const response = await fetch(`http://127.0.0.1:${S3_PORT}/minio/health/ready`, { signal: AbortSignal.timeout(3000) });
        await response.body?.cancel();
        if (response.status === 200) return;
        lastObservation = { httpStatus: response.status };
      } catch (error) { lastObservation = failureDiagnostic('readiness', item.kind, error); }
    }
    await delay(250);
  }
  throw new ResourcesError('Timeout de readiness del recurso CI propio.', { ...lastObservation, reason: 'readiness-timeout' });
}
function prepareDatabases(pg) {
  const psql = (step, database, sql) => {
    try {
      return docker(['exec', pg.containerId, 'psql', '--username', PG_ACTOR,
        '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', sql]);
    } catch (error) {
      throw new ResourcesError('Falló una llamada PostgreSQL del recurso propio.', {
        ...failureDiagnostic('databases', 'postgres', error), step: permitted(step, DATABASE_STEPS),
      });
    }
  };
  const identity = psql(DATABASE_STEPS[0], MAIN_DB, "SELECT current_database()||'|'||current_user||'|'||pg_get_userbyid(datdba)||'|'||(current_setting('server_version_num')::int/10000) FROM pg_database WHERE datname=current_database()");
  if (identity !== `${MAIN_DB}|${PG_ACTOR}|${PG_ACTOR}|16`) throw new ResourcesError('Identidad, ownership o versión PostgreSQL incorrectos.', { step: DATABASE_STEPS[0] });
  psql(DATABASE_STEPS[1], MAIN_DB, `CREATE DATABASE ${RESTORE_DB} OWNER ${PG_ACTOR}`);
  const empty = psql(DATABASE_STEPS[2], RESTORE_DB, "SELECT current_database()||'|'||current_user||'|'||pg_get_userbyid(datdba)||'|'||(SELECT count(*) FROM information_schema.tables WHERE table_schema='public') FROM pg_database WHERE datname=current_database()");
  if (empty !== `${RESTORE_DB}|${PG_ACTOR}|${PG_ACTOR}|0`) throw new ResourcesError('Destino restore no es una base propia vacía.', { step: DATABASE_STEPS[2] });
}
function mask(value) {
  process.stdout.write('::add-mask::' + value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A') + '\n');
}
function environment(state) {
  const pgPassword = randomBytes(32).toString('hex'), accessKey = 'financeci' + state.ownerId.slice(0, 12);
  const secretKey = randomBytes(32).toString('hex'), jwt = randomBytes(32).toString('hex'), otp = randomBytes(32).toString('hex');
  const endpoint = `http://127.0.0.1:${S3_PORT}`;
  const databaseUrl = database => `postgresql://${PG_ACTOR}:${pgPassword}@127.0.0.1:${PG_PORT}/${database}?schema=public`;
  const bucket = 'top-finance-files-test-' + state.ownerId, restoreBucket = 'top-finance-files-restore-test-' + state.ownerId;
  const values = {
    NODE_ENV: 'test', DATABASE_URL: databaseUrl(MAIN_DB), TEST_DATABASE_URL: databaseUrl(MAIN_DB),
    TEST_DATABASE_OWNER: PG_ACTOR, TEST_FINANCE_RESTORE_DATABASE_URL: databaseUrl(RESTORE_DB),
    TEST_FINANCE_PG_RUN_ID: state.ownerId, JWT_ACCESS_SECRET: jwt, PASSWORD_RESET_OTP_SECRET: otp,
    EMAIL_DELIVERY_MODE: 'console', FINANCE_EVIDENCE_STORAGE: 's3-private', FINANCE_S3_BUCKET: bucket,
    TEST_FINANCE_S3_BUCKET: bucket, TEST_FINANCE_S3_RESTORE_BUCKET: restoreBucket, TEST_FINANCE_S3_OWNER_ID: state.ownerId,
    S3_ENDPOINT: endpoint, S3_PUBLIC_ENDPOINT: endpoint, S3_REGION: 'us-east-1', S3_BUCKET: bucket,
    S3_ACCESS_KEY: accessKey, S3_SECRET_KEY: secretKey, S3_FORCE_PATH_STYLE: 'true',
  };
  for (const value of [pgPassword, secretKey, accessKey, jwt, otp, endpoint, values.DATABASE_URL, values.TEST_FINANCE_RESTORE_DATABASE_URL]) mask(value);
  return { values, docker: { POSTGRES_USER: PG_ACTOR, POSTGRES_PASSWORD: pgPassword, POSTGRES_DB: MAIN_DB,
    MINIO_ROOT_USER: accessKey, MINIO_ROOT_PASSWORD: secretKey } };
}
async function prepareBuckets(ctx, state, values) {
  const requireBackend = createRequire(path.join(ctx.repo, 'backend', 'package.json'));
  const sdk = requireBackend('@aws-sdk/client-s3');
  const client = new sdk.S3Client({ endpoint: values.S3_ENDPOINT, region: values.S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: values.S3_ACCESS_KEY, secretAccessKey: values.S3_SECRET_KEY } });
  try {
    for (const bucket of [values.TEST_FINANCE_S3_BUCKET, values.TEST_FINANCE_S3_RESTORE_BUCKET]) {
      await client.send(new sdk.CreateBucketCommand({ Bucket: bucket }));
      const key = 'qa-owned/' + state.ownerId;
      await client.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from('Owned synthetic TOP Finance CI private marker'),
        ACL: 'private', Metadata: { owner: state.ownerId, purpose: 'fin032-synthetic-test' } }));
      const acl = await client.send(new sdk.GetBucketAclCommand({ Bucket: bucket }));
      const grantee = acl.Grants?.[0]?.Grantee;
      // MinIO fijado devuelve ACL dummy: Owner.ID vacío y Grantee.ID omitido.
      // Sólo normalizar esas ausencias; un ID presente debe coincidir exactamente.
      const ownerId = acl.Owner?.ID ?? '', granteeId = grantee?.ID ?? '';
      if (acl.Grants?.length !== 1 || !acl.Owner || grantee?.Type !== 'CanonicalUser' || grantee.URI || grantee.EmailAddress
        || acl.Grants[0].Permission !== 'FULL_CONTROL' || typeof ownerId !== 'string' || typeof granteeId !== 'string'
        || granteeId !== ownerId) throw new ResourcesError('Bucket CI no conserva ACL privada del dueño.', { reason: 'bucket-acl-not-private' });
      try { await client.send(new sdk.GetBucketPolicyCommand({ Bucket: bucket })); throw new ResourcesError('Bucket CI tiene una policy inesperada.', { reason: 'bucket-policy-present' }); }
      catch (error) { if (error.name !== 'NoSuchBucketPolicy') throw error; }
      const marker = await client.send(new sdk.HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (marker.Metadata?.owner !== state.ownerId || marker.Metadata?.purpose !== 'fin032-synthetic-test') throw new ResourcesError('Sentinel de ownership S3 incorrecto.', { reason: 'bucket-sentinel-mismatch' });
      const anonymous = await fetch(values.S3_ENDPOINT + '/' + bucket + '/' + key, { signal: AbortSignal.timeout(5000) });
      await anonymous.body?.cancel();
      if (anonymous.status !== 403) throw new ResourcesError('Sentinel S3 no devolvió la denegación anónima esperada.', { reason: 'bucket-anonymous-status', httpStatus: anonymous.status });
    }
  } finally { client.destroy(); }
}
function exportEnvironment(ctx, values) {
  const lines = Object.entries(values).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n\0]/.test(value)) throw new ResourcesError('Entorno CI inválido.');
    return key + '=' + value;
  });
  fs.appendFileSync(ctx.envFile, lines.join('\n') + '\n', 'utf8');
}
function cleanupOne(ctx, state, item) {
  const cid = readCid(item) ?? item.containerId;
  // Sólo inspección por nombre exacto para recuperar el CID si Docker create falló
  // antes de registrar stdout/cidfile. La eliminación siempre utiliza el ID completo.
  const current = inspection(cid ?? item.name, true);
  if (current) {
    attest(ctx, state, item, current);
    const id = current.Id;
    docker(['rm', '--force', id], {}, 30000);
    if (inspection(id, true)) throw new ResourcesError('El recurso CI propio no desapareció.');
  }
  if (fs.existsSync(item.cidFile)) fs.unlinkSync(item.cidFile);
}
async function cleanup(ctx) {
  const state = ownState(ctx);
  if (!state) return;
  let firstFailure = null;
  for (const item of [...state.resources].reverse()) {
    try { cleanupOne(ctx, state, item); }
    catch (error) { firstFailure ??= failureDiagnostic('cleanup', item.kind, error); }
  }
  if (firstFailure) throw new ResourcesError('Cleanup CI incompleto: se conservaron metadatos y no se tocó ownership ajeno.', firstFailure);
  const next = ctx.stateFile + '.' + state.ownerId + '.next';
  if (fs.existsSync(next)) {
    if (!fs.lstatSync(next).isFile()) throw new ResourcesError('Scratch CI no es regular; se conserva para revisión.');
    fs.unlinkSync(next);
  }
  fs.unlinkSync(ctx.stateFile);
}
async function start(ctx) {
  const state = { version: 1, ownerId: randomBytes(16).toString('hex'), purpose: PURPOSE,
    runId: ctx.runId, attempt: ctx.attempt, job: ctx.job, resources: [] };
  state.resources = ['postgres', 'minio'].map(kind => descriptor(ctx, state.ownerId, kind));
  persist(ctx, state, true);
  const secrets = environment(state);
  let phase = 'ports', resource = 'postgres';
  try {
    await assertFree(PG_PORT);
    resource = 'minio'; await assertFree(S3_PORT);
    phase = 'image-pull';
    resource = 'postgres'; docker(['pull', '--platform', 'linux/amd64', PG_IMAGE], {}, 180000);
    resource = 'minio'; state.resources[1].imageId = await buildMinioImage(); persist(ctx, state);
    phase = 'creation';
    for (const item of state.resources) { resource = item.kind; createContainer(ctx, state, item, secrets.docker); }
    phase = 'readiness';
    for (const item of state.resources) { resource = item.kind; await ready(ctx, state, item); }
    phase = 'databases'; resource = 'postgres';
    prepareDatabases(state.resources[0]);
    phase = 'buckets'; resource = 'minio';
    await prepareBuckets(ctx, state, secrets.values);
    secrets.values.TEST_FINANCE_PG_CONTAINER_ID = state.resources[0].containerId;
    phase = 'export'; resource = 'none';
    exportEnvironment(ctx, secrets.values);
    process.stdout.write('Recursos Finance CI propios y privados preparados: dos contenedores efímeros.\n');
  } catch (error) {
    const diagnostic = failureDiagnostic(phase, resource, error);
    try { await cleanup(ctx); }
    catch (cleanupError) {
      const cleanupDiagnostic = failureDiagnostic('cleanup', cleanupError instanceof ResourcesError ? cleanupError.details.resource : 'none', cleanupError);
      throw new ResourcesError('Preparación CI falló y cleanup requiere revisión del ownership propio.', { ...diagnostic, cleanup: { status: 'failed', ...cleanupDiagnostic } });
    }
    throw new ResourcesError('Preparación CI falló; recursos propios retirados sin reutilizar servicios.', { ...diagnostic, cleanup: { status: 'complete' } });
  }
}
async function main() {
  const command = process.argv[2], ctx = context();
  if (command === 'start') return start(ctx);
  if (command === 'cleanup') {
    await cleanup(ctx);
    process.stdout.write('Cleanup Finance CI completado para IDs y labels propios.\n');
    return;
  }
  throw new ResourcesError('Usar exclusivamente start o cleanup.');
}
if (require.main === module) main().catch(error => {
  // Nunca imprimir args, URLs, inspection, objetos SDK ni stack con credenciales.
  process.stderr.write((error instanceof ResourcesError ? error.message : 'Falló el control de recursos Finance CI propios.') + '\n');
  const details = error instanceof ResourcesError ? error.details : {};
  process.stderr.write('Diagnóstico seguro CI: ' + JSON.stringify(failureDiagnostic(details.phase ?? (process.argv[2] === 'cleanup' ? 'cleanup' : 'context'), details.resource, error)) + '\n');
  process.exitCode = 1;
});
