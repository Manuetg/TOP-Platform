'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const expectedUrl = 'postgresql://top_night_test:top-night-integration-synthetic-20261001@127.0.0.1:55473/top_test?schema=public';
if (!process.env.TOP_QA_REPO_ROOT) throw new Error('Falta TOP_QA_REPO_ROOT; usar wrapper portable.');
const backendRoot = path.join(path.resolve(process.env.TOP_QA_REPO_ROOT), 'backend');
const url = new URL(process.env.DATABASE_URL || 'about:blank');
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== expectedUrl
    || url.hostname !== '127.0.0.1' || url.port !== '55473' || url.pathname !== '/top_test') {
  throw new Error('El gate solo admite el entorno test y la DB efimera reservada.');
}
if (process.env.EMAIL_DELIVERY_MODE !== 'console'
    || Object.entries(process.env).some(([key, value]) => /^(SMTP_|S3_)/.test(key) && value)) {
  throw new Error('Se requiere email console y almacenamiento en memoria sin SMTP/S3.');
}
for (const candidate of [path.join(backendRoot, '.env'), path.join(backendRoot, 'prisma', '.env')]) {
  if (fs.existsSync(candidate)) throw new Error('El contexto de gates no admite .env.');
}
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const { PrismaClient } = backendRequire('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: expectedUrl } } });
async function main() {
  const result = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS actor`;
  if (result.length !== 1 || result[0].database !== 'top_test' || result[0].actor !== 'top_night_test') {
    throw new Error('Identidad PostgreSQL distinta de la DB/actor propios de QA.');
  }
  console.log(JSON.stringify({ database: result[0].database, actor: result[0].actor, host: url.hostname, port: url.port, mode: process.env.NODE_ENV, email: 'console', storage: 'memory' }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
