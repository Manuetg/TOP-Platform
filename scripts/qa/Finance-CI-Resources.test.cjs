'use strict';

// Pruebas de diagnóstico y ownership en memoria: nunca invocan Docker, red o DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const SOURCE = fs.readFileSync(path.join(__dirname, 'Finance-CI-Resources.cjs'), 'utf8');
const CANARY = 'CANARY_SECRET_dont_print_url_password_or_external_resource';
const OWNER = 'ab'.repeat(16);
const ID = 'cd'.repeat(32);
const MINIO_IMAGE_ID = 'sha256:' + '12'.repeat(32);
const CTX = {
  repo: '/virtual/repo', temp: '/virtual/temp', envFile: '/virtual/temp/github-env',
  stateFile: '/virtual/temp/top-finance-ci-42-1-finance.json',
  runId: '42', attempt: '1', job: 'finance',
};
const EXPORTS = `
module.exports = { ResourcesError, failureDiagnostic, context, descriptor, labels,
  dockerResult, docker, attest, cleanupOne, cleanup, start, main, ready, assertFree, prepareDatabases, prepareBuckets,
  minioArchive, buildMinioImage, MINIO_BINARY_SHA, MINIO_BINARY_SIZE, MINIO_BINARY_URL,
  replace(values) {
    if (values.persist) persist = values.persist;
    if (values.environment) environment = values.environment;
    if (values.assertFree) assertFree = values.assertFree;
    if (values.docker) docker = values.docker;
    if (values.buildMinioImage) buildMinioImage = values.buildMinioImage;
    if (values.createContainer) createContainer = values.createContainer;
    if (values.ready) ready = values.ready;
    if (values.prepareDatabases) prepareDatabases = values.prepareDatabases;
    if (values.prepareBuckets) prepareBuckets = values.prepareBuckets;
    if (values.exportEnvironment) exportEnvironment = values.exportEnvironment;
    if (values.cleanup) cleanup = values.cleanup;
    if (values.context) context = values.context;
  }
};`;

function fixture(options = {}) {
  const files = new Map();
  const commands = [];
  const output = { stdout: '', stderr: '' };
  let now = 0;
  const processStub = {
    platform: 'linux', versions: { node: '22.23.2' }, argv: ['node', 'helper', 'start'],
    env: { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_WORKSPACE: CTX.repo,
      GITHUB_RUN_ID: CTX.runId, GITHUB_RUN_ATTEMPT: CTX.attempt, GITHUB_JOB: CTX.job,
      RUNNER_TEMP: CTX.temp, GITHUB_ENV: CTX.envFile, SECRET: CANARY },
    stdout: { write: value => { output.stdout += value; } },
    stderr: { write: value => { output.stderr += value; } },
    exitCode: 0,
  };
  const fsStub = {
    realpathSync: value => value,
    existsSync: value => files.has(value),
    lstatSync: value => ({ isFile: () => files.has(value) }),
    readFileSync: value => {
      if (!files.has(value)) throw Object.assign(new Error(CANARY), { code: 'ENOENT' });
      return files.get(value);
    },
    writeFileSync: (value, body, flags) => {
      if (flags?.flag === 'wx' && files.has(value)) throw Object.assign(new Error(CANARY), { code: 'EEXIST' });
      files.set(value, body);
    },
    appendFileSync: (value, body) => files.set(value, (files.get(value) || '') + body),
    renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    unlinkSync: value => { files.delete(value); },
  };
  const imports = {
    'node:fs': fsStub,
    'node:path': path.posix,
    'node:net': { createServer: () => {
      if (options.server) return options.server();
      throw new Error('El fixture debe simular explícitamente puertos.');
    } },
    'node:crypto': { randomBytes: length => Buffer.alloc(length, 0xab), createHash },
    'node:child_process': { spawnSync: (command, args, configuration) => {
      commands.push({ command, args, configuration });
      return options.spawn ? options.spawn(command, args, configuration)
        : { status: 0, signal: null, stdout: '', stderr: '' };
    } },
    'node:module': { createRequire: () => () => {
      if (options.sdk) return options.sdk;
      throw new Error('El fixture debe simular explícitamente SDK S3.');
    } },
    'node:timers/promises': { setTimeout: async value => { now += value; } },
  };
  const moduleStub = { exports: {} };
  const requireStub = name => {
    if (!(name in imports)) throw new Error('Import no autorizado en el fixture: ' + name);
    return imports[name];
  };
  requireStub.main = {};
  class Clock extends Date { static now() { return now; } }
  const sandbox = vm.createContext({ require: requireStub, module: moduleStub,
    __dirname: CTX.repo + '/scripts/qa', process: processStub, Buffer, Date: Clock,
    AbortSignal: { timeout: () => ({}) },
    fetch: options.fetch || (async () => { throw new Error('El fixture no permite llamadas de red.'); }),
  });
  vm.runInContext(SOURCE + EXPORTS, sandbox, { filename: 'finance-ci-resources.cjs' });
  return {
    api: moduleStub.exports, files, commands, output, process: processStub,
    async entry() {
      requireStub.main = moduleStub;
      vm.runInContext(SOURCE.slice(SOURCE.indexOf('if (require.main === module)')), sandbox);
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function owned(f) {
  const state = { version: 1, ownerId: OWNER, purpose: 'fin032-ci-resources-v1',
    runId: CTX.runId, attempt: CTX.attempt, job: CTX.job,
    resources: ['postgres', 'minio'].map(kind => f.api.descriptor(CTX, OWNER, kind)) };
  state.resources[0].containerId = ID;
  state.resources[1].imageId = MINIO_IMAGE_ID;
  return state;
}
function inspection(f, state, item) {
  return { Id: item.containerId || ID, Name: '/' + item.name, Image: item.imageId,
    Config: { Image: item.image, Labels: f.api.labels(CTX, state, item) },
    HostConfig: { AutoRemove: true, Privileged: false, NetworkMode: 'default',
      ReadonlyRootfs: item.kind === 'minio', Tmpfs: item.tmpfs,
      PortBindings: { [item.containerPort]: [{ HostIp: '127.0.0.1', HostPort: item.hostPort }] } },
    Mounts: [], State: { Running: true, Health: { Status: 'healthy' } },
  };
}

const DATABASE_CALLS = [
  { step: 'main-identity', database: 'top_test',
    sql: "SELECT current_database()||'|'||current_user||'|'||pg_get_userbyid(datdba)||'|'||(current_setting('server_version_num')::int/10000) FROM pg_database WHERE datname=current_database()",
    stdout: 'top_test|top_night_test|top_night_test|16\n' },
  { step: 'restore-create', database: 'top_test',
    sql: 'CREATE DATABASE top_finance_files_restore_test OWNER top_night_test', stdout: 'CREATE DATABASE\n' },
  { step: 'restore-identity', database: 'top_finance_files_restore_test',
    sql: "SELECT current_database()||'|'||current_user||'|'||pg_get_userbyid(datdba)||'|'||(SELECT count(*) FROM information_schema.tables WHERE table_schema='public') FROM pg_database WHERE datname=current_database()",
    stdout: 'top_finance_files_restore_test|top_night_test|top_night_test|0\n' },
];

function noisyExternalError() {
  return Object.assign(new Error(CANARY), { name: CANARY, code: 'ETIMEDOUT', stack: CANARY,
    stdout: CANARY, stderr: CANARY, args: [CANARY], env: { SECRET: CANARY },
    details: { step: 'restore-identity', operation: 'rm', reason: 'permission-denied', message: CANARY },
    $metadata: { httpStatusCode: 503, requestId: CANARY }, sdk: { response: CANARY } });
}
function databaseResponse(index, options = {}) {
  assert.ok(DATABASE_CALLS[index], 'No debe ejecutarse una cuarta llamada PostgreSQL.');
  if (index === options.failedIndex) {
    if (options.throwExternal) throw noisyExternalError();
    return { status: 2, signal: 'SIGTERM', stdout: CANARY, stderr: CANARY,
      message: CANARY, stack: CANARY, args: [CANARY], env: { SECRET: CANARY },
      error: noisyExternalError(), sdk: { response: CANARY } };
  }
  return { status: 0, signal: null,
    stdout: index === options.invalidIdentity ? CANARY : DATABASE_CALLS[index].stdout, stderr: CANARY };
}
function databaseFixture(options) {
  let calls = 0;
  return fixture({ spawn: (_command, args) => {
    assert.equal(args[0], 'exec');
    return databaseResponse(calls++, options);
  } });
}
function expectedDatabaseFailure(step) {
  return { phase: 'databases', resource: 'postgres', operation: 'exec', exitCode: 2,
    errorCode: 'ETIMEDOUT', signal: 'SIGTERM', reason: 'docker-failed', httpStatus: null, step };
}
function assertSafeFailure(error, diagnostic, output) {
  assert.ok(!JSON.stringify({ message: error.message, details: error.details, diagnostic, output }).includes(CANARY));
}

test('prepareDatabases real ejecuta tres llamadas en orden con SQL, bases y argumentos vigentes', () => {
  const f = databaseFixture();
  f.api.prepareDatabases(owned(f).resources[0]);
  assert.equal(f.commands.length, 3);
  for (const [index, expected] of DATABASE_CALLS.entries()) {
    const command = f.commands[index];
    assert.equal(command.command, 'docker');
    assert.deepEqual(Array.from(command.args), ['exec', ID, 'psql', '--username', 'top_night_test',
      '--dbname', expected.database, '--no-psqlrc', '--tuples-only', '--no-align', '--set',
      'ON_ERROR_STOP=1', '--command', expected.sql]);
    assert.equal(command.configuration.shell, false);
    assert.equal(command.configuration.timeout, 10000);
  }
  assert.equal(f.output.stdout + f.output.stderr, '');
});

for (const [failedIndex, { step }] of DATABASE_CALLS.entries()) {
  test(`prepareDatabases real identifica fallo ${step}, descarta canarios y detiene llamadas posteriores`, () => {
    const f = databaseFixture({ failedIndex });
    assert.throws(() => f.api.prepareDatabases(owned(f).resources[0]), error => {
      assert.ok(error instanceof f.api.ResourcesError);
      const diagnostic = plain(f.api.failureDiagnostic('databases', 'postgres', error));
      assert.deepEqual(diagnostic, expectedDatabaseFailure(step));
      assertSafeFailure(error, diagnostic, f.output);
      return true;
    });
    assert.equal(f.commands.length, failedIndex + 1);
    assert.equal(f.output.stdout + f.output.stderr, '');
  });
}

for (const invalidIdentity of [0, 2]) {
  const { step } = DATABASE_CALLS[invalidIdentity];
  test(`prepareDatabases real atribuye guard de identidad a ${step} sin copiar respuesta externa`, () => {
    const f = databaseFixture({ invalidIdentity });
    assert.throws(() => f.api.prepareDatabases(owned(f).resources[0]), error => {
      const diagnostic = plain(f.api.failureDiagnostic('databases', 'postgres', error));
      assert.deepEqual(diagnostic, { phase: 'databases', resource: 'postgres', operation: null,
        exitCode: null, errorCode: null, signal: null, reason: 'guard-rejected', httpStatus: null, step });
      assertSafeFailure(error, diagnostic, f.output);
      return true;
    });
    assert.equal(f.commands.length, invalidIdentity + 1);
    assert.equal(f.output.stdout + f.output.stderr, '');
  });
}

test('prepareDatabases real sanea una excepción externa del ejecutor y conserva el step interno', () => {
  const f = databaseFixture({ failedIndex: 1, throwExternal: true });
  assert.throws(() => f.api.prepareDatabases(owned(f).resources[0]), error => {
    const diagnostic = plain(f.api.failureDiagnostic('databases', 'postgres', error));
    assert.deepEqual(diagnostic, { phase: 'databases', resource: 'postgres', operation: null,
      exitCode: null, errorCode: 'ETIMEDOUT', signal: null, reason: 'external-error', httpStatus: 503,
      step: 'restore-create' });
    assertSafeFailure(error, diagnostic, f.output);
    return true;
  });
  assert.equal(f.commands.length, 2);
  assert.equal(f.output.stdout + f.output.stderr, '');
});

test('diagnóstico acepta sólo steps internos cerrados en databases/postgres y elimina campos externos', () => {
  const f = fixture();
  for (const { step } of DATABASE_CALLS) {
    const details = { step, operation: 'exec', reason: CANARY, postgresCategory: CANARY,
      stdout: CANARY, stderr: CANARY, args: [CANARY], env: { SECRET: CANARY },
      stack: CANARY, message: CANARY, metadata: { image: CANARY }, sdk: { response: CANARY } };
    const error = new f.api.ResourcesError(CANARY, details);
    error.stack = CANARY;
    const diagnostic = plain(f.api.failureDiagnostic('databases', 'postgres', error));
    assert.deepEqual(diagnostic, { phase: 'databases', resource: 'postgres', operation: 'exec',
      exitCode: null, errorCode: null, signal: null, reason: 'guard-rejected', httpStatus: null, step });
    assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
    for (const [phase, resource] of [['buckets', 'postgres'], ['databases', 'minio'],
      ['cleanup', 'postgres'], [CANARY, CANARY]]) {
      assert.ok(!('step' in f.api.failureDiagnostic(phase, resource, error)));
    }
  }
  for (const step of [CANARY, 'database-create', null, 1, ['restore-create'], { step: 'restore-create' }]) {
    const error = new f.api.ResourcesError(CANARY, { step, reason: CANARY });
    const diagnostic = plain(f.api.failureDiagnostic('databases', 'postgres', error));
    assert.ok(!('step' in diagnostic));
    assert.equal(diagnostic.reason, 'guard-rejected');
    assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
  }
  const external = noisyExternalError();
  external.step = 'main-identity';
  assert.ok(!('step' in f.api.failureDiagnostic('databases', 'postgres', external)));
});

// El lifecycle usa prepareDatabases, Docker, readiness, ownership y cleanup reales.
// Sólo puertos, credenciales y build MinIO se simulan fuera del objetivo PostgreSQL.
function databaseLifecycleFixture(failedIndex, cleanupFails = false) {
  const containers = new Map(), removed = new Set();
  const ids = [ID, 'ef'.repeat(32)];
  let calls = 0, f;
  f = fixture({ fetch: async () => ({ status: 200, body: { cancel: async () => undefined } }),
    spawn: (_command, args) => {
      const operation = args[0], id = args.at(-1);
      if (operation === 'pull' || operation === 'start') return { status: 0, stdout: '', stderr: CANARY };
      if (operation === 'create') {
        const state = JSON.parse(f.files.get(CTX.stateFile));
        const item = state.resources.find(candidate => candidate.cidFile === args[args.indexOf('--cidfile') + 1]);
        assert.ok(item);
        item.containerId = ids[item.kind === 'postgres' ? 0 : 1];
        f.files.set(item.cidFile, item.containerId + '\n');
        containers.set(item.containerId, inspection(f, state, item));
        return { status: 0, stdout: item.containerId + '\n', stderr: CANARY };
      }
      if (operation === 'exec') {
        assert.equal(args[1], ID);
        const result = databaseResponse(calls++, { failedIndex });
        if (result.status !== 0 && cleanupFails) {
          containers.get(ids[1]).Config.Labels['top.finance.qa.owner'] = CANARY;
        }
        return result;
      }
      if (operation === 'rm') {
        assert.ok(containers.has(id), 'Cleanup sólo puede eliminar un ID propio conocido.');
        removed.add(id);
        return { status: 0, stdout: CANARY, stderr: CANARY };
      }
      assert.equal(operation, 'inspect');
      if (removed.has(id)) return { status: 1, stdout: CANARY, stderr: 'No such object ' + CANARY };
      assert.ok(containers.has(id), 'No debe inspeccionarse ni eliminarse un recurso externo.');
      return { status: 0, stdout: JSON.stringify([containers.get(id)]), stderr: CANARY };
    } });
  f.api.replace({ context: () => CTX, assertFree: async () => undefined,
    environment: () => ({ values: {}, docker: { POSTGRES_PASSWORD: CANARY, MINIO_ROOT_PASSWORD: CANARY } }),
    buildMinioImage: async () => MINIO_IMAGE_ID });
  f.files.set('/virtual/temp/foreign.cid', CANARY);
  return { f, ids, removed, calls: () => calls };
}
function assertDatabaseCleanup(lifecycle, cleanupFails) {
  const { f, ids, removed } = lifecycle;
  assert.deepEqual(f.commands.filter(command => command.args[0] === 'rm').map(command => Array.from(command.args)),
    (cleanupFails ? [ids[0]] : [ids[1], ids[0]]).map(id => ['rm', '--force', id]));
  assert.ok(removed.has(ids[0]));
  assert.equal(removed.has(ids[1]), !cleanupFails);
  assert.equal(f.files.has(CTX.stateFile), cleanupFails);
  const state = owned(f);
  assert.ok(!f.files.has(state.resources[0].cidFile));
  assert.equal(f.files.has(state.resources[1].cidFile), cleanupFails);
  assert.equal(f.files.get('/virtual/temp/foreign.cid'), CANARY);
  assert.ok(!f.files.has(CTX.envFile));
  for (const id of removed) {
    const removal = f.commands.findIndex(command => command.args[0] === 'rm' && command.args.at(-1) === id);
    assert.deepEqual(Array.from(f.commands[removal - 1].args), ['inspect', id]);
    assert.deepEqual(Array.from(f.commands[removal + 1].args), ['inspect', id]);
  }
}

for (const [failedIndex, { step }] of DATABASE_CALLS.entries()) {
  const cleanupFails = failedIndex === 1;
  test(`start real conserva primario ${step} con cleanup ${cleanupFails ? 'fallido por ownership' : 'completo'}`, async () => {
    const lifecycle = databaseLifecycleFixture(failedIndex, cleanupFails), { f } = lifecycle;
    await assert.rejects(f.api.start(CTX), error => {
      const diagnostic = plain(f.api.failureDiagnostic('databases', 'postgres', error));
      const primary = expectedDatabaseFailure(step);
      if (cleanupFails) {
        primary.cleanup = { status: 'failed', phase: 'cleanup', resource: 'minio', operation: null,
          exitCode: null, errorCode: null, signal: null, reason: 'guard-rejected', httpStatus: null };
      } else primary.cleanup = { status: 'complete' };
      assert.deepEqual(diagnostic, primary);
      assertSafeFailure(error, diagnostic, f.output);
      return true;
    });
    assert.equal(lifecycle.calls(), failedIndex + 1);
    assertDatabaseCleanup(lifecycle, cleanupFails);
    assert.equal(f.output.stdout + f.output.stderr, '');
  });
}

for (const cleanupFails of [false, true]) {
  test(`entrada real emite step PostgreSQL seguro y cleanup ${cleanupFails ? 'fallido' : 'completo'} separado`, async () => {
    const lifecycle = databaseLifecycleFixture(2, cleanupFails), { f } = lifecycle;
    await f.entry();
    assert.equal(f.process.exitCode, 1);
    assert.equal(f.output.stdout, '');
    assert.ok(!f.output.stderr.includes(CANARY));
    const lines = f.output.stderr.trim().split('\n');
    assert.equal(lines.length, 2);
    const diagnostic = JSON.parse(lines[1].replace('Diagnóstico seguro CI: ', ''));
    const { cleanup, ...primary } = diagnostic;
    assert.deepEqual(primary, expectedDatabaseFailure('restore-identity'));
    assert.equal(cleanup.status, cleanupFails ? 'failed' : 'complete');
    if (cleanupFails) {
      assert.equal(cleanup.resource, 'minio');
      assert.equal(cleanup.reason, 'guard-rejected');
      assert.ok(!('step' in cleanup));
    }
    assert.equal(lifecycle.calls(), 3);
    assertDatabaseCleanup(lifecycle, cleanupFails);
  });
}

test('diagnóstico elimina texto externo, campos extra y enums o números no permitidos', () => {
  const f = fixture();
  const error = new f.api.ResourcesError(CANARY, {
    operation: CANARY, exitCode: 256, errorCode: CANARY, signal: CANARY, reason: CANARY,
    httpStatus: 600, stdout: CANARY, stderr: CANARY, args: [CANARY], env: { SECRET: CANARY },
    cleanup: { status: 'failed', resource: CANARY, operation: CANARY, exitCode: -1,
      errorCode: CANARY, signal: CANARY, reason: CANARY, httpStatus: 99,
      message: CANARY, cleanup: { status: 'failed', message: CANARY } },
  });
  const result = plain(f.api.failureDiagnostic(CANARY, CANARY, error));
  assert.deepEqual(result, { phase: 'context', resource: 'none', operation: null,
    exitCode: null, errorCode: null, signal: null, reason: 'guard-rejected', httpStatus: null,
    cleanup: { status: 'failed', phase: 'cleanup', resource: 'none', operation: null,
      exitCode: null, errorCode: null, signal: null, reason: 'guard-rejected', httpStatus: null } });
  assert.ok(!JSON.stringify(result).includes(CANARY));
});

test('diagnóstico externo conserva sólo código SDK y HTTP permitidos', () => {
  const f = fixture();
  const error = Object.assign(new Error(CANARY), {
    name: 'AccessDenied', code: CANARY, $metadata: { httpStatusCode: 403, requestId: CANARY },
    stdout: CANARY, stderr: CANARY, details: { operation: 'rm', reason: 'permission-denied' },
  });
  assert.deepEqual(plain(f.api.failureDiagnostic('buckets', 'minio', error)), {
    phase: 'buckets', resource: 'minio', operation: null, exitCode: null,
    errorCode: 'AccessDenied', signal: null, reason: 'external-error', httpStatus: 403,
  });
});

for (const [exitCode, httpStatus] of [[0, 100], [255, 599]]) {
  test(`diagnóstico admite límites numéricos ${exitCode}/${httpStatus} y enums conocidos`, () => {
    const f = fixture();
    const error = new f.api.ResourcesError('Fallo interno.', {
      operation: 'exec', exitCode, errorCode: 'ETIMEDOUT', signal: 'SIGTERM',
      reason: 'docker-failed', httpStatus,
    });
    assert.deepEqual(plain(f.api.failureDiagnostic('databases', 'postgres', error)), {
      phase: 'databases', resource: 'postgres', operation: 'exec', exitCode,
      errorCode: 'ETIMEDOUT', signal: 'SIGTERM', reason: 'docker-failed', httpStatus,
    });
  });
}

const dockerReasons = [
  ['manifest unknown', 'manifest-unknown'], ['no matching manifest', 'platform-unavailable'],
  ['pull access denied', 'image-unavailable'], ['Cannot connect to the Docker daemon', 'daemon-unavailable'],
  ['permission denied', 'permission-denied'], ['port is already allocated', 'port-in-use'],
  ['read-only file system', 'read-only-filesystem'], ['toomanyrequests', 'rate-limited'],
  [CANARY, 'docker-failed'],
];
for (const [stderr, reason] of dockerReasons) {
  test(`Docker clasifica ${reason} sin emitir stdout, stderr, argumentos o entorno`, () => {
    const f = fixture({ spawn: () => ({ status: 125, signal: 'SIGTERM',
      stdout: CANARY, stderr: stderr + ' ' + CANARY,
      error: Object.assign(new Error(CANARY), { code: 'ETIMEDOUT' }) }) });
    assert.throws(() => f.api.docker(['pull', CANARY], { TOKEN: CANARY }), error => {
      const diagnostic = plain(f.api.failureDiagnostic('image-pull', 'minio', error));
      assert.deepEqual(diagnostic, { phase: 'image-pull', resource: 'minio', operation: 'pull',
        exitCode: 125, errorCode: 'ETIMEDOUT', signal: 'SIGTERM', reason, httpStatus: null });
      assert.ok(!JSON.stringify({ message: error.message, diagnostic }).includes(CANARY));
      return true;
    });
    assert.equal(f.commands[0].command, 'docker');
    assert.equal(f.commands[0].configuration.shell, false);
    assert.equal(f.output.stdout + f.output.stderr, '');
  });
}

test('Docker descarta operación, código y señal arbitrarios', () => {
  const f = fixture({ spawn: () => ({ status: null, signal: CANARY, stdout: CANARY,
    stderr: CANARY, error: Object.assign(new Error(CANARY), { code: CANARY }) }) });
  assert.throws(() => f.api.docker([CANARY, CANARY]), error => {
    assert.deepEqual(plain(f.api.failureDiagnostic('creation', 'postgres', error)), {
      phase: 'creation', resource: 'postgres', operation: null, exitCode: null,
      errorCode: null, signal: null, reason: 'docker-failed', httpStatus: null,
    });
    return true;
  });
});

function failStage(f, phase, resource, cleanupError) {
  let cleanups = 0;
  const external = Object.assign(new Error(CANARY), { code: 'ETIMEDOUT', name: CANARY });
  const fail = (candidate, kind) => { if (phase === candidate && resource === kind) throw external; };
  f.api.replace({
    environment: () => ({ values: { TOKEN: CANARY }, docker: { PASSWORD: CANARY } }),
    assertFree: async port => fail('ports', port === 55473 ? 'postgres' : 'minio'),
    docker: args => fail('image-pull', args.at(-1).startsWith('postgres:') ? 'postgres' : 'minio'),
    buildMinioImage: async () => { fail('image-pull', 'minio'); return MINIO_IMAGE_ID; },
    createContainer: (_ctx, _state, item) => { fail('creation', item.kind); item.containerId = ID; },
    ready: async (_ctx, _state, item) => fail('readiness', item.kind),
    prepareDatabases: () => fail('databases', 'postgres'),
    prepareBuckets: async () => fail('buckets', 'minio'),
    exportEnvironment: () => fail('export', 'none'),
    cleanup: async () => { cleanups += 1; if (cleanupError) throw cleanupError; },
  });
  return () => cleanups;
}

const stages = [
  ['ports', 'postgres'], ['ports', 'minio'], ['image-pull', 'postgres'], ['image-pull', 'minio'],
  ['creation', 'postgres'], ['creation', 'minio'], ['readiness', 'postgres'], ['readiness', 'minio'],
  ['databases', 'postgres'], ['buckets', 'minio'], ['export', 'none'],
];
for (const [phase, resource] of stages) {
  test(`start conserva fase ${phase}/${resource} y cleanup separado, sin filtrar secretos`, async () => {
    const f = fixture();
    const cleanups = failStage(f, phase, resource);
    await assert.rejects(f.api.start(CTX), error => {
      assert.deepEqual(plain(error.details), { phase, resource, operation: null, exitCode: null,
        errorCode: 'ETIMEDOUT', signal: null, reason: 'external-error', httpStatus: null,
        cleanup: { status: 'complete' } });
      assert.ok(!JSON.stringify({ message: error.message, details: error.details }).includes(CANARY));
      return true;
    });
    assert.equal(cleanups(), 1);
    assert.equal(f.commands.length, 0);
    assert.ok(!f.files.has(CTX.envFile));
  });
}

test('cleanup fallido conserva el diagnóstico primario y sanea su diagnóstico secundario', async () => {
  const f = fixture();
  const cleanupError = new f.api.ResourcesError('Cleanup interno.', { resource: 'minio',
    operation: 'rm', exitCode: 137, errorCode: 'EACCES', signal: 'SIGKILL',
    reason: 'permission-denied', httpStatus: 403, stdout: CANARY, stderr: CANARY,
    cleanup: { status: 'failed', message: CANARY } });
  const cleanups = failStage(f, 'databases', 'postgres', cleanupError);
  await assert.rejects(f.api.start(CTX), error => {
    const diagnostic = plain(f.api.failureDiagnostic(error.details.phase, error.details.resource, error));
    assert.equal(diagnostic.phase, 'databases');
    assert.equal(diagnostic.resource, 'postgres');
    assert.equal(diagnostic.errorCode, 'ETIMEDOUT');
    assert.equal(diagnostic.cleanup.status, 'failed');
    assert.equal(diagnostic.cleanup.phase, 'cleanup');
    assert.equal(diagnostic.cleanup.resource, 'minio');
    assert.equal(diagnostic.cleanup.operation, 'rm');
    assert.equal(diagnostic.cleanup.errorCode, 'EACCES');
    assert.equal(diagnostic.cleanup.exitCode, 137);
    assert.equal(diagnostic.cleanup.signal, 'SIGKILL');
    assert.ok(!('cleanup' in diagnostic.cleanup));
    assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
    return true;
  });
  assert.equal(cleanups(), 1);
});

test('entrada real imprime sólo mensaje interno y JSON seguro de fallo externo con cleanup fallido', async () => {
  const f = fixture();
  f.api.replace({ context: () => CTX });
  failStage(f, 'buckets', 'minio', Object.assign(new Error(CANARY), {
    name: CANARY, code: CANARY, $metadata: { httpStatusCode: 503, requestId: CANARY },
  }));
  await f.entry();
  assert.equal(f.process.exitCode, 1);
  assert.equal(f.output.stdout, '');
  assert.ok(!f.output.stderr.includes(CANARY));
  const lines = f.output.stderr.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Preparación CI falló y cleanup requiere revisión del ownership propio.');
  const diagnostic = JSON.parse(lines[1].replace('Diagnóstico seguro CI: ', ''));
  assert.equal(diagnostic.phase, 'buckets');
  assert.equal(diagnostic.resource, 'minio');
  assert.equal(diagnostic.errorCode, 'ETIMEDOUT');
  assert.equal(diagnostic.cleanup.phase, 'cleanup');
  assert.equal(diagnostic.cleanup.httpStatus, 503);
  assert.equal(diagnostic.cleanup.errorCode, null);
});

test('entrada real ubica una variable CI inválida en fase context sin copiar su valor', async () => {
  const f = fixture();
  f.process.env.GITHUB_JOB = CANARY + '\n';
  await f.entry();
  assert.equal(f.process.exitCode, 1);
  assert.ok(!f.output.stderr.includes(CANARY));
  const diagnostic = JSON.parse(f.output.stderr.trim().split('\n')[1].replace('Diagnóstico seguro CI: ', ''));
  assert.equal(diagnostic.phase, 'context');
  assert.equal(diagnostic.resource, 'none');
  assert.equal(f.commands.length, 0);
});

const foreign = [
  ['ID', current => { current.Id = 'ef'.repeat(32); }],
  ['nombre', current => { current.Name = '/' + CANARY; }],
  ['imagen', current => { current.Config.Image = CANARY; }],
  ['label', current => { current.Config.Labels['top.finance.qa.owner'] = 'ef'.repeat(16); }],
  ['tmpfs', current => { current.HostConfig.Tmpfs = { '/data': 'rw,size=1m' }; }],
  ['mount', current => { current.Mounts = [{ Type: 'volume', Destination: '/data', Source: CANARY }]; }],
  ['bind', current => { current.HostConfig.Binds = [CANARY]; }],
  ['puerto', current => { current.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0'; }],
  ['privileged', current => { current.HostConfig.Privileged = true; }],
  ['autoremove', current => { current.HostConfig.AutoRemove = false; }],
];
for (const [name, mutate] of foreign) {
  test(`cleanup rechaza ${name} ajeno o inseguro sin emitir rm ni borrar CID`, () => {
    let current;
    const f = fixture({ spawn: () => ({ status: 0, stdout: JSON.stringify([current]), stderr: '' }) });
    const state = owned(f), item = state.resources[0];
    current = inspection(f, state, item);
    mutate(current);
    f.files.set(item.cidFile, ID + '\n');
    assert.throws(() => f.api.cleanupOne(CTX, state, item), f.api.ResourcesError);
    assert.ok(f.files.has(item.cidFile));
    assert.ok(f.commands.length > 0);
    assert.ok(f.commands.every(command => command.args[0] === 'inspect'));
  });
}

test('cleanup de recurso atestado usa ID completo, verifica desaparición y borra sólo su CID', () => {
  let current, removed = false;
  const f = fixture({ spawn: (_command, args) => {
    if (args[0] === 'rm') { removed = true; return { status: 0, stdout: '', stderr: '' }; }
    return removed ? { status: 1, stdout: '', stderr: 'No such object' }
      : { status: 0, stdout: JSON.stringify([current]), stderr: '' };
  } });
  const state = owned(f), item = state.resources[0];
  current = inspection(f, state, item);
  f.files.set(item.cidFile, ID + '\n');
  f.files.set('/virtual/temp/foreign.cid', CANARY);
  f.api.cleanupOne(CTX, state, item);
  assert.deepEqual(f.commands.map(command => Array.from(command.args)), [
    ['inspect', ID], ['rm', '--force', ID], ['inspect', ID],
  ]);
  assert.ok(!f.files.has(item.cidFile));
  assert.equal(f.files.get('/virtual/temp/foreign.cid'), CANARY);
});

test('cleanup global intenta ambos recursos en orden inverso y preserva state si falla ownership', async () => {
  const containers = new Map();
  const removed = new Set();
  const f = fixture({ spawn: (_command, args) => {
    const id = args.at(-1);
    if (args[0] === 'rm') { removed.add(id); return { status: 0, stdout: '', stderr: '' }; }
    if (removed.has(id)) return { status: 1, stdout: '', stderr: 'No such container' };
    return { status: 0, stdout: JSON.stringify([containers.get(id)]), stderr: '' };
  } });
  const state = owned(f);
  state.resources[1].containerId = 'ef'.repeat(32);
  for (const item of state.resources) {
    containers.set(item.containerId, inspection(f, state, item));
    f.files.set(item.cidFile, item.containerId + '\n');
  }
  containers.get(state.resources[1].containerId).Config.Labels['top.finance.qa.owner'] = CANARY;
  f.files.set(CTX.stateFile, JSON.stringify(state));
  await assert.rejects(f.api.cleanup(CTX), error => {
    assert.equal(error.details.phase, 'cleanup');
    assert.equal(error.details.resource, 'minio');
    assert.equal(error.details.reason, 'guard-rejected');
    assert.ok(!JSON.stringify({ message: error.message, details: error.details }).includes(CANARY));
    return true;
  });
  assert.deepEqual(f.commands.filter(command => command.args[0] === 'inspect')
    .map(command => command.args[1]), [state.resources[1].containerId, ID, ID]);
  assert.deepEqual(f.commands.filter(command => command.args[0] === 'rm')
    .map(command => Array.from(command.args)), [['rm', '--force', ID]]);
  assert.ok(f.files.has(CTX.stateFile));
  assert.ok(f.files.has(state.resources[1].cidFile));
  assert.ok(!f.files.has(state.resources[0].cidFile));
});

test('readiness MinIO conserva sólo HTTP observado y timeout, sin red real', async () => {
  let current;
  const f = fixture({ spawn: () => ({ status: 0, stdout: JSON.stringify([current]), stderr: '' }),
    fetch: async () => ({ status: 503, body: { cancel: async () => undefined } }) });
  const state = owned(f), item = state.resources[1];
  item.containerId = ID;
  current = inspection(f, state, item);
  await assert.rejects(f.api.ready(CTX, state, item), error => {
    const diagnostic = f.api.failureDiagnostic('readiness', 'minio', error);
    assert.equal(diagnostic.httpStatus, 503);
    assert.equal(diagnostic.reason, 'readiness-timeout');
    return true;
  });
});

test('comprobación de puerto conserva EADDRINUSE sin copiar mensaje de socket', async () => {
  let errorHandler;
  const f = fixture({ server: () => ({
    once: (_event, handler) => { errorHandler = handler; },
    listen: () => errorHandler(Object.assign(new Error(CANARY), { code: 'EADDRINUSE' })),
  }) });
  await assert.rejects(f.api.assertFree(55473), error => {
    const diagnostic = f.api.failureDiagnostic('ports', 'postgres', error);
    assert.equal(diagnostic.errorCode, 'EADDRINUSE');
    assert.ok(!JSON.stringify({ message: error.message, diagnostic }).includes(CANARY));
    return true;
  });
});

test('MinIO fija release oficial, tamaño y SHA256 sin configuración externa mutable', () => {
  const f = fixture();
  assert.equal(f.api.MINIO_BINARY_SHA, '7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f');
  assert.equal(f.api.MINIO_BINARY_SIZE, 110989496);
  assert.equal(f.api.MINIO_BINARY_URL, 'https://github.com/minio/minio/releases/download/RELEASE.2025-09-07T16-13-09Z/minio.linux-amd64.RELEASE.2025-09-07T16-13-09Z');
  f.process.env.MINIO_BINARY_SHA = CANARY;
  f.process.env.MINIO_BINARY_SIZE = '1';
  f.process.env.MINIO_BINARY_URL = CANARY;
  const item = f.api.descriptor(CTX, OWNER, 'minio');
  assert.equal(item.image, 'top-finance-ci-minio:sha256-7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f');
  assert.equal(item.imageId, null);
});

test('tar MinIO contiene sólo Dockerfile y binario con nombres, modos, contenido y checksum válidos', () => {
  const f = fixture();
  const binary = Buffer.from('binario sintético en memoria');
  const archive = f.api.minioArchive(binary);
  const entries = [];
  let offset = 0;
  while (archive.subarray(offset, offset + 512).some(byte => byte !== 0)) {
    const header = archive.subarray(offset, offset + 512);
    const value = (start, end) => header.subarray(start, end).toString('utf8').split('\0')[0];
    const size = parseInt(value(124, 136), 8);
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(32, 148, 156);
    assert.equal(parseInt(value(148, 156), 8), [...checksumHeader].reduce((sum, byte) => sum + byte, 0));
    assert.equal(value(257, 263), 'ustar');
    assert.equal(value(156, 157), '0');
    assert.equal(parseInt(value(108, 116), 8), 0);
    assert.equal(parseInt(value(116, 124), 8), 0);
    entries.push({ name: value(0, 100), mode: parseInt(value(100, 108), 8),
      body: archive.subarray(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(archive.length - offset, 1024);
  assert.ok(archive.subarray(offset).every(byte => byte === 0));
  assert.deepEqual(entries.map(({ name, mode }) => ({ name, mode })), [
    { name: 'Dockerfile', mode: 0o644 }, { name: 'minio', mode: 0o755 },
  ]);
  assert.equal(entries[0].body.toString(), 'FROM scratch\nCOPY minio /usr/bin/minio\nENTRYPOINT ["/usr/bin/minio"]\n');
  assert.deepEqual(entries[1].body, binary);
});

for (const [status, hasBody] of [[404, true], [200, false]]) {
  test(`descarga MinIO rechaza HTTP/body inválido ${status}/${hasBody} sin invocar Docker`, async () => {
    let cancelled = 0, requestedUrl;
    const f = fixture({ fetch: async url => {
      requestedUrl = url;
      return { status, body: hasBody ? { cancel: async () => { cancelled += 1; } } : null };
    } });
    f.process.env.MINIO_BINARY_URL = CANARY;
    await assert.rejects(f.api.buildMinioImage(), error => {
      const diagnostic = f.api.failureDiagnostic('image-pull', 'minio', error);
      assert.equal(diagnostic.httpStatus, status);
      assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
      return true;
    });
    assert.equal(requestedUrl, f.api.MINIO_BINARY_URL);
    assert.equal(cancelled, hasBody ? 1 : 0);
    assert.equal(f.commands.length, 0);
  });
}

test('descarga MinIO truncada falla antes de Docker aunque la respuesta declare el SHA esperado', async () => {
  let f;
  f = fixture({ fetch: async () => ({ status: 200,
    headers: { get: () => f.api.MINIO_BINARY_SHA },
    body: (async function* () { yield Buffer.from('truncado'); })() }) });
  await assert.rejects(f.api.buildMinioImage(), error => error instanceof f.api.ResourcesError);
  assert.equal(f.commands.length, 0);
});

test('descarga MinIO detiene stream sobredimensionado antes de Docker', async () => {
  let f, closed = false;
  f = fixture({ fetch: async () => ({ status: 200, body: (async function* () {
    try {
      const chunk = Buffer.alloc(65536);
      for (let size = 0; size <= f.api.MINIO_BINARY_SIZE; size += chunk.length) yield chunk;
      assert.fail('El helper debe abandonar el stream al exceder su límite.');
    } finally { closed = true; }
  })() }) });
  await assert.rejects(f.api.buildMinioImage(), error => error instanceof f.api.ResourcesError);
  assert.equal(closed, true);
  assert.equal(f.commands.length, 0);
});

test('descarga MinIO de tamaño exacto y SHA incorrecto falla sin build ni aceptar overrides', async () => {
  let f;
  f = fixture({ fetch: async () => ({ status: 200, body: (async function* () {
    const chunk = Buffer.alloc(65536);
    let remaining = f.api.MINIO_BINARY_SIZE;
    while (remaining) {
      const size = Math.min(chunk.length, remaining);
      yield chunk.subarray(0, size);
      remaining -= size;
    }
  })() }) });
  // Incluso una configuración externa con el digest del fixture no sustituye el pin.
  f.process.env.MINIO_BINARY_SHA = createHash('sha256').update(Buffer.from('otro binario')).digest('hex');
  await assert.rejects(f.api.buildMinioImage(), error => error instanceof f.api.ResourcesError);
  assert.equal(f.commands.length, 0);
});

test('Docker build conserva operación y códigos seguros sin copiar stderr o stdin', () => {
  const f = fixture({ spawn: () => ({ status: 1, signal: 'SIGKILL', stdout: CANARY,
    stderr: 'permission denied ' + CANARY, error: Object.assign(new Error(CANARY), { code: 'EACCES' }) }) });
  assert.throws(() => f.api.docker(['build', '--quiet', '-'], {}, 180000, Buffer.from(CANARY)), error => {
    assert.deepEqual(plain(f.api.failureDiagnostic('image-pull', 'minio', error)), {
      phase: 'image-pull', resource: 'minio', operation: 'build', exitCode: 1,
      errorCode: 'EACCES', signal: 'SIGKILL', reason: 'permission-denied', httpStatus: null,
    });
    assert.ok(!error.message.includes(CANARY));
    return true;
  });
  assert.equal(f.commands[0].configuration.input.toString(), CANARY);
  assert.equal(f.commands[0].configuration.shell, false);
  assert.equal(f.output.stdout + f.output.stderr, '');
});

test('cleanup MinIO rechaza ID de imagen diferente pese a nombre, tag y labels propios', () => {
  let current;
  const f = fixture({ spawn: () => ({ status: 0, stdout: JSON.stringify([current]), stderr: '' }) });
  const state = owned(f), item = state.resources[1];
  item.containerId = ID;
  current = inspection(f, state, item);
  current.Image = 'sha256:' + '34'.repeat(32);
  f.files.set(item.cidFile, ID + '\n');
  assert.throws(() => f.api.cleanupOne(CTX, state, item), f.api.ResourcesError);
  assert.ok(f.files.has(item.cidFile));
  assert.ok(f.commands.every(command => command.args[0] === 'inspect'));
});

function bucketsFixture(fault, aclOverride) {
  const sent = [], requests = [];
  let destroyed = 0, cancelled = 0;
  const command = type => class { constructor(input) { this.type = type; this.input = input; } };
  const sdk = {
    S3Client: class {
      async send(item) {
        sent.push(item);
        if (fault === 'sdk' && item.type === 'CreateBucketCommand') {
          throw Object.assign(new Error(CANARY), { name: 'AccessDenied',
            $metadata: { httpStatusCode: 403, requestId: CANARY }, response: CANARY });
        }
        if (item.type === 'GetBucketAclCommand') return aclOverride ?? {
          Owner: { ID: 'synthetic-owner' },
          Grants: [{ Grantee: fault === 'acl' ? { Type: 'CanonicalUser', URI: CANARY }
            : { Type: 'CanonicalUser', ID: 'synthetic-owner' },
            Permission: 'FULL_CONTROL' }],
          extraMetadata: CANARY,
        };
        if (item.type === 'GetBucketPolicyCommand') {
          if (fault === 'policy') return { Policy: CANARY };
          throw Object.assign(new Error(CANARY), { name: 'NoSuchBucketPolicy' });
        }
        if (item.type === 'HeadObjectCommand') return { Metadata: {
          owner: fault === 'sentinel' ? CANARY : OWNER, purpose: 'fin032-synthetic-test', raw: CANARY,
        } };
        return {};
      }
      destroy() { destroyed += 1; }
    },
    ...Object.fromEntries(['CreateBucketCommand', 'PutObjectCommand', 'GetBucketAclCommand',
      'GetBucketPolicyCommand', 'HeadObjectCommand'].map(name => [name, command(name)])),
  };
  const f = fixture({ sdk, fetch: async url => {
    requests.push(url);
    return { status: fault === 'anonymous' ? 200 : 403,
      body: { cancel: async () => { cancelled += 1; } }, headers: { raw: CANARY } };
  } });
  const values = { S3_ENDPOINT: 'http://fake.invalid/' + CANARY, S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: CANARY, S3_SECRET_KEY: CANARY,
    TEST_FINANCE_S3_BUCKET: 'private-source-' + CANARY,
    TEST_FINANCE_S3_RESTORE_BUCKET: 'private-restore-' + CANARY };
  return { f, values, sent, requests, destroyed: () => destroyed, cancelled: () => cancelled };
}

for (const [fault, reason] of [
  ['acl', 'bucket-acl-not-private'], ['policy', 'bucket-policy-present'],
  ['sentinel', 'bucket-sentinel-mismatch'], ['anonymous', 'bucket-anonymous-status'],
]) {
  test(`prepareBuckets real rechaza ${reason} con diagnóstico cerrado y destruye cliente`, async () => {
    const b = bucketsFixture(fault), state = owned(b.f);
    await assert.rejects(b.f.api.prepareBuckets(CTX, state, b.values), error => {
      assert.ok(error instanceof b.f.api.ResourcesError);
      const diagnostic = plain(b.f.api.failureDiagnostic('buckets', 'minio', error));
      assert.deepEqual(diagnostic, { phase: 'buckets', resource: 'minio', operation: null,
        exitCode: null, errorCode: null, signal: null, reason,
        httpStatus: fault === 'anonymous' ? 200 : null });
      assert.ok(!JSON.stringify({ message: error.message, diagnostic }).includes(CANARY));
      return true;
    });
    assert.equal(b.destroyed(), 1);
    assert.equal(b.f.commands.length, 0);
    assert.equal(b.f.output.stdout + b.f.output.stderr, '');
  });
}

test('prepareBuckets real valida ambos buckets privados, marcador y denegación anónima', async () => {
  const b = bucketsFixture(), state = owned(b.f);
  await b.f.api.prepareBuckets(CTX, state, b.values);
  assert.equal(b.destroyed(), 1);
  assert.equal(b.cancelled(), 2);
  assert.equal(b.requests.length, 2);
  assert.equal(b.sent.length, 10);
  for (const bucket of [b.values.TEST_FINANCE_S3_BUCKET, b.values.TEST_FINANCE_S3_RESTORE_BUCKET]) {
    const commands = b.sent.filter(item => item.input.Bucket === bucket);
    assert.deepEqual(commands.map(item => item.type), [
      'CreateBucketCommand', 'PutObjectCommand', 'GetBucketAclCommand',
      'GetBucketPolicyCommand', 'HeadObjectCommand',
    ]);
    const marker = commands[1].input;
    assert.equal(marker.ACL, 'private');
    assert.equal(marker.Key, 'qa-owned/' + OWNER);
    assert.deepEqual(plain(marker.Metadata), { owner: OWNER, purpose: 'fin032-synthetic-test' });
  }
  assert.equal(b.f.commands.length, 0);
  assert.equal(b.f.output.stdout + b.f.output.stderr, '');
});

test('prepareBuckets real propaga AccessDenied saneable y destruye cliente sin copiar metadata SDK', async () => {
  const b = bucketsFixture('sdk'), state = owned(b.f);
  await assert.rejects(b.f.api.prepareBuckets(CTX, state, b.values), error => {
    const diagnostic = plain(b.f.api.failureDiagnostic('buckets', 'minio', error));
    assert.equal(diagnostic.errorCode, 'AccessDenied');
    assert.equal(diagnostic.httpStatus, 403);
    assert.equal(diagnostic.reason, 'external-error');
    assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
    return true;
  });
  assert.equal(b.destroyed(), 1);
  assert.equal(b.f.commands.length, 0);
  assert.equal(b.f.output.stdout + b.f.output.stderr, '');
});

for (const [ownerId, granteeId] of [['', undefined], [undefined, ''], ['', ''], [undefined, undefined]]) {
  test(`ACL MinIO privada admite IDs equivalentes ausentes/vacíos ${String(ownerId)}/${String(granteeId)}`, async () => {
    // Forma que entrega el SDK para el XML dummy privado de MinIO: Owner.ID vacío,
    // CanonicalUser sin ID, un único FULL_CONTROL y ningún URI público.
    const acl = { Owner: { ID: ownerId, DisplayName: '' }, Grants: [{
      Grantee: { ID: granteeId, Type: 'CanonicalUser' }, Permission: 'FULL_CONTROL',
    }] };
    const b = bucketsFixture(undefined, acl);
    await b.f.api.prepareBuckets(CTX, owned(b.f), b.values);
    assert.equal(b.cancelled(), 2);
    assert.equal(b.destroyed(), 1);
    assert.equal(b.f.commands.length, 0);
  });
}

for (const [ownerId, granteeId] of [['owner-presente', undefined], [undefined, 'grantee-presente'],
  ['owner-presente', 'grantee-diferente']]) {
  test(`ACL MinIO privada rechaza IDs realmente distintos ${String(ownerId)}/${String(granteeId)}`, async () => {
    const acl = { Owner: { ID: ownerId }, Grants: [{
      Grantee: { ID: granteeId, Type: 'CanonicalUser' }, Permission: 'FULL_CONTROL',
    }] };
    const b = bucketsFixture(undefined, acl);
    await assert.rejects(b.f.api.prepareBuckets(CTX, owned(b.f), b.values), error => {
      const diagnostic = b.f.api.failureDiagnostic('buckets', 'minio', error);
      assert.equal(diagnostic.reason, 'bucket-acl-not-private');
      return true;
    });
    assert.equal(b.destroyed(), 1);
    assert.equal(b.requests.length, 0);
    assert.equal(b.f.commands.length, 0);
  });
}

for (const [name, grants] of [
  ['más de un grant', [
    { Grantee: { Type: 'CanonicalUser', ID: '' }, Permission: 'FULL_CONTROL' },
    { Grantee: { Type: 'CanonicalUser', ID: '' }, Permission: 'FULL_CONTROL' },
  ]],
  ['permiso READ', [{ Grantee: { Type: 'CanonicalUser', ID: '' }, Permission: 'READ' }]],
  ['URI público', [{ Grantee: { Type: 'CanonicalUser', ID: '', URI: CANARY }, Permission: 'FULL_CONTROL' }]],
]) {
  test(`normalizar IDs ACL no admite ${name}`, async () => {
    const b = bucketsFixture(undefined, { Owner: { ID: '' }, Grants: grants });
    await assert.rejects(b.f.api.prepareBuckets(CTX, owned(b.f), b.values), error => {
      const diagnostic = b.f.api.failureDiagnostic('buckets', 'minio', error);
      assert.equal(diagnostic.reason, 'bucket-acl-not-private');
      assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
      return true;
    });
    assert.equal(b.destroyed(), 1);
    assert.equal(b.f.commands.length, 0);
  });
}

for (const [name, owner, grantee] of [
  ['Group', { ID: '' }, { Type: 'Group', ID: '' }],
  ['Type ausente', { ID: '' }, { ID: '' }],
  ['EmailAddress', { ID: '' }, { Type: 'CanonicalUser', ID: '', EmailAddress: CANARY }],
  ['Owner ausente', undefined, { Type: 'CanonicalUser', ID: '' }],
  ['ID owner numérico', { ID: 1 }, { Type: 'CanonicalUser', ID: '1' }],
  ['ID grantee numérico', { ID: '1' }, { Type: 'CanonicalUser', ID: 1 }],
]) {
  test(`ACL MinIO rechaza ${name} al conservar el contrato privado`, async () => {
    const b = bucketsFixture(undefined, { Owner: owner,
      Grants: [{ Grantee: grantee, Permission: 'FULL_CONTROL' }] });
    await assert.rejects(b.f.api.prepareBuckets(CTX, owned(b.f), b.values), error => {
      const diagnostic = b.f.api.failureDiagnostic('buckets', 'minio', error);
      assert.equal(diagnostic.reason, 'bucket-acl-not-private');
      assert.ok(!JSON.stringify(diagnostic).includes(CANARY));
      return true;
    });
    assert.equal(b.destroyed(), 1);
    assert.equal(b.f.commands.length, 0);
  });
}
