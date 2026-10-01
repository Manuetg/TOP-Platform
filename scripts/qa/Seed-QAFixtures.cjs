'use strict';

// Fixtures exclusivas de la base desechable de QA; no es un seed del producto.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');

const expectedDatabaseUrl = 'postgresql://top_night_test:top-night-integration-synthetic-20261001@127.0.0.1:55473/top_test?schema=public';
if (!process.env.TOP_QA_REPO_ROOT) throw new Error('Falta TOP_QA_REPO_ROOT; usar wrapper portable.');
const backendRoot = path.join(path.resolve(process.env.TOP_QA_REPO_ROOT), 'backend');
const fixtureFile = path.join(__dirname, 'qa-fixtures.json');

function assertEnvironment() {
  if (!process.argv.includes('--gates-terminados')) {
    throw new Error('Ejecutar solamente tras autorizacion explicita del integrador: gates terminados.');
  }
  const url = new URL(process.env.DATABASE_URL || 'about:blank');
  if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== expectedDatabaseUrl
      || url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1'
      || url.port !== '55473' || url.pathname !== '/top_test' || url.username !== 'top_night_test') {
    throw new Error('Se requiere exclusivamente NODE_ENV=test y la URL hardcoded de top_test en 127.0.0.1:55473.');
  }
  if (process.env.EMAIL_DELIVERY_MODE !== 'console'
      || Object.entries(process.env).some(([key, value]) => /^(SMTP_|S3_)/.test(key) && value)) {
    throw new Error('QA requiere email console y ausencia de configuracion SMTP/S3.');
  }
  for (const candidate of [path.join(backendRoot, '.env'), path.join(backendRoot, 'prisma', '.env')]) {
    if (fs.existsSync(candidate)) throw new Error('El contexto de QA debe estar libre de .env.');
  }
}

assertEnvironment();
const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
const { PrismaClient, Prisma } = backendRequire('@prisma/client');
const argon2 = backendRequire('argon2');
if (!Prisma.dmmf.datamodel.models.find((model) => model.name === 'User')?.fields.some((field) => field.name === 'displayName')) {
  throw new Error('Regenerar Prisma despues de integrar el contrato displayName y aplicar su migracion.');
}
const prisma = new PrismaClient({ datasources: { db: { url: expectedDatabaseUrl } } });

const users = [
  { id: 'a1000000-0000-4000-8000-000000000001', role: 'OWNER', email: 'owner@top-night.example.invalid', password: 'TopNight.Owner!2026-10-01', displayName: 'Operadora QA de nombre largo' },
  { id: 'a1000000-0000-4000-8000-000000000002', role: 'ADMIN', email: 'admin@top-night.example.invalid', password: 'TopNight.Admin!2026-10-01', displayName: 'Administracion QA' },
  { id: 'a1000000-0000-4000-8000-000000000003', role: 'RECEPTIONIST', email: 'receptionist@top-night.example.invalid', password: 'TopNight.Reception!2026-10-01', displayName: 'Recepcion QA' },
  { id: 'a1000000-0000-4000-8000-000000000004', role: 'VIEWER', email: 'viewer@top-night.example.invalid', password: 'TopNight.Viewer!2026-10-01', displayName: 'Consulta QA' },
];
const businesses = [
  { id: 'a2000000-0000-4000-8000-000000000001', name: '[QA nocturna] Posada del Bosque y la Arcilla con un nombre extenso', legalName: 'Establecimiento ficticio QA A', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE' },
  { id: 'a2000000-0000-4000-8000-000000000002', name: '[QA nocturna] Segundo negocio para aislamiento y estado vacio', legalName: 'Establecimiento ficticio QA B', timezone: 'America/Asuncion', currency: 'PYG', status: 'ACTIVE' },
];
const resources = [
  { id: 'a3000000-0000-4000-8000-000000000001', businessId: businesses[0].id, name: 'Cabana QA del Bosque con terraza panoramica para familias y grupos pequenos', internalCode: 'QA_NIGHT_ACTIVE', description: 'Recurso ficticio para QA visual.\nSin imagen: verificar fallback, jerarquia y texto largo.', capacityMinimum: 1, capacityMaximum: 6, capacityMaximumChildren: 3, status: 'ACTIVE', sortOrder: 0 },
  { id: 'a3000000-0000-4000-8000-000000000002', businessId: businesses[0].id, name: 'Habitacion QA fuera de servicio con un nombre extenso para revisar ajuste de texto', internalCode: 'QA_NIGHT_OUT', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 1, status: 'OUT_OF_SERVICE', sortOrder: 1 },
];
const contacts = [
  { id: 'a4000000-0000-4000-8000-000000000001', businessId: businesses[0].id, name: 'Huesped ficticio QA', lastName: 'Apellido largo para ajuste de texto', email: 'guest-a@top-night.example.invalid', country: 'PY', city: 'Asuncion', status: 'ACTIVE' },
  { id: 'a4000000-0000-4000-8000-000000000002', businessId: businesses[1].id, name: 'Contacto exclusivo del segundo negocio QA', lastName: 'Control de aislamiento', email: 'guest-b@top-night.example.invalid', country: 'PY', city: 'Asuncion', status: 'ACTIVE' },
];

function localToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}
const today = localToday();
function shiftedDate(days, hour = 0) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days, hour));
}
const bookingSpecifications = [
  { status: 'DRAFT', start: null, end: null },
  { status: 'PENDING', start: 4, end: 5 },
  { status: 'CONFIRMED', start: 7, end: 9 },
  { status: 'IN_PROGRESS', start: -1, end: 2 },
  { status: 'COMPLETED', start: -6, end: -4 },
  { status: 'CANCELLED', start: 10, end: 12 },
  { status: 'NO_SHOW', start: -3, end: -2 },
];
const bookings = bookingSpecifications.map((specification, index) => ({
  id: `a5000000-0000-4000-8000-00000000000${index + 1}`,
  businessId: businesses[0].id,
  status: specification.status,
  contactId: specification.start === null ? null : contacts[0].id,
  checkInDate: specification.start === null ? null : shiftedDate(specification.start),
  checkOutDate: specification.end === null ? null : shiftedDate(specification.end),
  adults: specification.start === null ? null : 2,
  children: specification.start === null ? null : 1,
  notes: `[QA nocturna] Fixture de lectura ${specification.status}; no usar para validar pagos ni transiciones.`,
  createdAt: shiftedDate(-10, 12),
}));
const blocks = [
  { id: 'a6000000-0000-4000-8000-000000000001', businessId: businesses[0].id, resourceId: resources[0].id, type: 'MAINTENANCE', reason: 'Mantenimiento ficticio de QA', notes: '[QA nocturna] Bloque futuro sin solapamiento con reservas activas del fixture.', startsAt: shiftedDate(14, 14), endsAt: shiftedDate(14, 17), status: 'SCHEDULED' },
  { id: 'a6000000-0000-4000-8000-000000000002', businessId: businesses[0].id, resourceId: resources[0].id, type: 'OTHER', reason: 'Bloque cancelado ficticio de QA', notes: '[QA nocturna] Control de lectura de cancelacion.', startsAt: shiftedDate(16, 14), endsAt: shiftedDate(16, 17), status: 'CANCELLED', cancellationReason: 'Cancelacion ficticia de QA', cancelledAt: new Date() },
];

async function assertDatabase() {
  const identity = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS actor`;
  if (identity.length !== 1 || identity[0].database !== 'top_test' || identity[0].actor !== 'top_night_test') {
    throw new Error('Identidad PostgreSQL distinta de la base y actor sinteticos reservados.');
  }
  const column = await prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'displayName') AS ready`;
  if (!column[0]?.ready) throw new Error('Falta la migracion displayName; no se escriben fixtures.');
  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
    if (existing && existing.email !== user.email) throw new Error('ID de usuario QA ocupado con otro correo; no se sobrescribe.');
  }
  for (const business of businesses) {
    const existing = await prisma.business.findUnique({ where: { id: business.id }, select: { name: true } });
    if (existing && !existing.name.startsWith('[QA nocturna]')) throw new Error('ID Business QA ocupado con otra identidad; no se sobrescribe.');
  }
}

async function main() {
  await assertDatabase();
  const passwordHashes = new Map();
  for (const user of users) {
    const hash = await argon2.hash(user.password, { type: argon2.argon2id });
    if (!await argon2.verify(hash, user.password)) throw new Error('La credencial sintetica no verifico con Argon2.');
    passwordHashes.set(user.id, hash);
  }
  await prisma.$transaction(async (transaction) => {
    for (const business of businesses) {
      await transaction.business.upsert({ where: { id: business.id }, update: {}, create: { ...business, createdAt: shiftedDate(-120, 12) } });
      await transaction.businessSubscription.upsert({ where: { businessId: business.id }, update: {}, create: { businessId: business.id, planCode: 'TOP_INITIAL' } });
    }
    for (const user of users) {
      await transaction.user.upsert({ where: { id: user.id }, update: {}, create: { id: user.id, email: user.email, displayName: user.displayName, emailVerifiedAt: new Date(), status: 'ACTIVE' } });
      await transaction.localCredential.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, passwordHash: passwordHashes.get(user.id) } });
      await transaction.userBusinessMembership.upsert({ where: { userId_businessId: { userId: user.id, businessId: businesses[0].id } }, update: {}, create: { userId: user.id, businessId: businesses[0].id, role: user.role } });
    }
    await transaction.userBusinessMembership.upsert({ where: { userId_businessId: { userId: users[0].id, businessId: businesses[1].id } }, update: {}, create: { userId: users[0].id, businessId: businesses[1].id, role: 'OWNER' } });
    for (const resource of resources) {
      await transaction.resource.upsert({ where: { id: resource.id }, update: {}, create: { ...resource, createdAt: shiftedDate(-90, 12) } });
    }
    for (const contact of contacts) {
      await transaction.contact.upsert({ where: { id: contact.id }, update: {}, create: contact });
    }
    for (const booking of bookings) {
      await transaction.booking.upsert({ where: { id: booking.id }, update: {}, create: { ...booking, ...(booking.status === 'DRAFT' ? {} : { resources: { create: [{ resourceId: resources[0].id }] } }) } });
    }
    for (const block of blocks) {
      await transaction.block.upsert({ where: { id: block.id }, update: {}, create: block });
    }
  }, { timeout: 60000 });

  const persistedUsers = await prisma.user.findMany({ where: { id: { in: users.map((user) => user.id) } }, select: { id: true, email: true, displayName: true, status: true, emailVerifiedAt: true } });
  for (const user of users) {
    const persisted = persistedUsers.find((record) => record.id === user.id);
    const credential = await prisma.localCredential.findUnique({ where: { userId: user.id } });
    if (!persisted || persisted.email !== user.email || persisted.status !== 'ACTIVE' || !persisted.emailVerifiedAt
        || !credential || !await argon2.verify(credential.passwordHash, user.password)) {
      throw new Error('Fixture de usuario existente no coincide; no se informa un login valido.');
    }
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    purpose: 'Fixtures sinteticos de QA interactiva aislada; nunca datos reales.',
    database: { host: '127.0.0.1', port: 55473, name: 'top_test', container: process.env.TOP_QA_PG_CONTAINER_NAME || 'registrar-contenedor-propio-de-esta-sesion' },
    plannedOrigins: { api: 'http://127.0.0.1:3047/api', frontend: 'http://127.0.0.1:4177' },
    users,
    businesses,
    resources,
    contacts,
    bookings: bookings.map((booking) => ({ id: booking.id, businessId: booking.businessId, status: booking.status, checkInDate: booking.checkInDate?.toISOString().slice(0, 10) ?? null, checkOutDate: booking.checkOutDate?.toISOString().slice(0, 10) ?? null, readOnlyStatusFixture: true })),
    blocks,
    recommendedDashboardPeriod: { from: shiftedDate(-14).toISOString().slice(0, 10), to: shiftedDate(1).toISOString().slice(0, 10) },
    limitations: [
      'Reservas de lectura sin PricingSnapshot, Payment ni PaymentPlan: no acreditan flujos financieros ni lifecycle.',
      'No se inventan eventos Timeline ni se ejecutan confirmaciones.',
      'DRAFT incompleto; negocio B vacio de recursos y reservas para aislamiento/empty.',
      'Sin imagenes ni storage cloud: ambos recursos validan fallbacks.',
      'El script crea lo ausente; no reinterpreta ni resetea registros existentes.',
      'Integration, E2E y Acceptance pueden limpiar la DB; volver a ejecutar solo tras gates terminados.',
    ],
  };
  fs.writeFileSync(fixtureFile, JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8' });
  console.log(`Fixtures preparados: ${users.length} usuarios verificados, ${businesses.length} negocios, ${resources.length} recursos, ${bookings.length} reservas, ${blocks.length} bloques.`);
  console.log(`Manifest local de IDs y credenciales ficticias: ${fixtureFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
