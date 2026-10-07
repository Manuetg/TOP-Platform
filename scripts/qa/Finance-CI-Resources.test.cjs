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
  dockerResult, docker, attest, cleanupOne, cleanup, start, main, ready, assertFree,
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
