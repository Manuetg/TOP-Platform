import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceCommand, FinanceReport } from '../../src/modules/finance/domain/finance.types';
import {
  closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, financeInstant, financePaymentFixture,
  financePeriod, paymentFingerprint, realFinanceToken, resetFinanceDatabase, type FinanceFixture,
} from '../fixtures/finance-fixture';

function csvRows(csv: string): Record<string, string>[] {
  const lines = csv.replace(/^\uFEFF/u, '').trimEnd().split(/\r?\n/u);
  const parse = (line: string): string[] => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/gu)].map(match => match[1].replace(/""/gu, '"'));
  const columns = parse(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(parse(line).map((value, index) => [columns[index], value])));
}

describe('Finance V1 HTTP con JWT, membresía y PostgreSQL reales', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FinanceFixture;
  let ownerToken: string;
  const endpoint = (businessId?: string) => `/api/businesses/${businessId ?? fixture.business.id}/finance`;
  const mutation = (command: object, key: string = randomUUID(), token = ownerToken, businessId?: string) => request(app.getHttpServer()).post(`${endpoint(businessId)}/commands`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(command);
  const report = async (): Promise<FinanceReport> => (await request(app.getHttpServer()).get(endpoint()).set('Authorization', `Bearer ${ownerToken}`).query(financePeriod).expect(200)).body as FinanceReport;

  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); ownerToken = await realFinanceToken(app, fixture.users.OWNER.id); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  it('flujo real guardar/recargar/pago parcial/detalle/export mantiene costo900000/deuda600000/caja700000', async () => {
    const account = await mutation({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco sintético', opening: { amountMinor: 1000000, occurredAt: financeInstant, reason: 'Apertura conocida' } }).expect(200);
    const expense = await mutation(expenseCommand(fixture)).expect(200);
    let value = await report();
    expect(value.totals).toMatchObject({ operatingCostMinor: 900000, outstandingMinor: 900000, registeredBalanceMinor: 1000000 });
    await mutation({ type: 'SETTLE_EXPENSE', id: expense.body.id, expectedVersion: 1, settlement: { accountId: account.body.id, amountMinor: 300000, occurredAt: '2026-10-02T12:00:00Z', reference: 'Pago externo ya realizado' } }).expect(200);
    value = await report();
    expect(value.totals).toMatchObject({ operatingCostMinor: 900000, outstandingMinor: 600000, registeredBalanceMinor: 700000 });
    const detail = await request(app.getHttpServer()).get(`${endpoint()}/expenses/${expense.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(detail.body.expense).toMatchObject({ amountMinor: 900000, outstandingMinor: 600000, paidAmountMinor: 300000 });
    expect(detail.body.audit.every((entry: { actorUserId: string }) => entry.actorUserId === fixture.users.OWNER.id)).toBe(true);
    const exported = await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...financePeriod, token: value.token }).expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    const rows = csvRows(exported.text);
    expect(rows.filter(row => row.recordType === 'EXPENSE').map(row => row.id)).toEqual(value.expenses.map(row => row.id));
    expect(rows.filter(row => row.recordType === 'EXPENSE').reduce((sum, row) => sum + Number(row.amountMinor), 0)).toBe(900000);
    expect(rows.find(row => row.recordType === 'TOTAL' && row.sourceType === 'outstandingMinor')?.amountMinor).toBe('600000');
    expect(rows.find(row => row.recordType === 'TOTAL' && row.sourceType === 'registeredBalanceMinor')?.amountMinor).toBe('700000');
    expect(rows.every(row => row.businessId === fixture.business.id && row.currency === 'PYG' && row.token === value.token)).toBe(true);
  });

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const)('%s sin capabilities Finance no puede leer/escribir/exportar ni acceder auditoría', async role => {
    const expense = await mutation(expenseCommand(fixture)).expect(200);
    const token = await realFinanceToken(app, fixture.users[role].id);
    await request(app.getHttpServer()).get(endpoint()).set('Authorization', `Bearer ${token}`).query(financePeriod).expect(403);
    await request(app.getHttpServer()).get(`${endpoint()}/expenses/${expense.body.id}`).set('Authorization', `Bearer ${token}`).expect(403);
    await mutation({ type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'Prohibida' }, randomUUID(), token).expect(403);
    await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${token}`).query({ ...financePeriod, token: 'token-no-autorizado' }).expect(403);
    expect(await prisma.financeCatalog.count({ where: { name: 'Prohibida' } })).toBe(0);
    // Las capabilities existentes de Payment se conservan para todos los roles.
    const { booking } = await financePaymentFixture(prisma, fixture.actor);
    await request(app.getHttpServer()).get(`/api/businesses/${fixture.business.id}/bookings/${booking.id}/payments`).set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('JWT ausente, firma inválida y expirado no revelan reporte ni permiten mutación', async () => {
    await request(app.getHttpServer()).get(endpoint()).query(financePeriod).expect(401);
    await mutation(expenseCommand(fixture), randomUUID(), 'invalid.jwt.signature').expect(401);
    const expired = await new JwtService().signAsync({ sub: fixture.users.OWNER.id }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: -1 });
    await mutation(expenseCommand(fixture), randomUUID(), expired).expect(401);
    expect(await prisma.financeExpense.count()).toBe(0);
  });

  it('revocar membresía o cambiar rol invalida token existente en lectura, export y escritura', async () => {
    await prisma.userBusinessMembership.update({ where: { userId_businessId: { userId: fixture.users.OWNER.id, businessId: fixture.business.id } }, data: { role: 'ADMIN' } });
    await mutation(expenseCommand(fixture)).expect(403);
    await request(app.getHttpServer()).get(endpoint()).set('Authorization', `Bearer ${ownerToken}`).query(financePeriod).expect(403);
    await prisma.userBusinessMembership.delete({ where: { userId_businessId: { userId: fixture.users.OWNER.id, businessId: fixture.business.id } } });
    await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...financePeriod, token: 'no-data' }).expect(403);
    expect(await prisma.financeExpense.count()).toBe(0);
  });

  it('usuario deshabilitado con JWT vigente obtiene401 sin efectos', async () => {
    await prisma.user.update({ where: { id: fixture.users.OWNER.id }, data: { status: 'DISABLED' } });
    await mutation(expenseCommand(fixture)).expect(401);
    expect(await prisma.financeExpense.count()).toBe(0);
  });

  it('tenant de URL ajeno se deniega y referencias ajenas retornan404 indistinguible de inexistente', async () => {
    await request(app.getHttpServer()).get(endpoint(fixture.foreignBusiness.id)).set('Authorization', `Bearer ${ownerToken}`).query(financePeriod).expect(403);
    const command = expenseCommand(fixture);
    const foreign = await mutation({ ...command, counterpartyId: fixture.foreignCounterparty.id }).expect(404);
    const missing = await mutation({ ...command, counterpartyId: randomUUID() }).expect(404);
    expect(foreign.body).toEqual(missing.body);
    expect(JSON.stringify(foreign.body)).not.toContain(fixture.foreignCounterparty.id);
    expect(await prisma.financeExpense.count()).toBe(0);
  });

  it.each(['OUT_OF_SERVICE', 'ARCHIVED'] as const)('HTTP permite reparación imputada a recurso propio %s y conserva tenant y estado', async status => {
    await prisma.resource.update({ where: { id: fixture.resource.id }, data: { status } });
    const expense = await mutation(expenseCommand(fixture)).expect(200);
    const value = await report();
    expect(value.expenses.find(row => row.id === expense.body.id)?.lines[0]).toMatchObject({ resourceId: fixture.resource.id, amountMinor: 900000 });
    expect(value.resources.find(row => row.id === fixture.resource.id)).toMatchObject({ active: false });
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: fixture.resource.id } })).status).toBe(status);
    const foreign = expenseCommand(fixture);
    foreign.lines[0].resourceId = fixture.foreignResource.id;
    await mutation(foreign).expect(404);
    expect(await prisma.financeExpense.count()).toBe(1);
  });

  it('Payment ajeno no admite vínculo y no cambia su registro', async () => {
    const account = await mutation({ type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Caja', opening: { amountMinor: 0, occurredAt: financeInstant, reason: 'Apertura' } }).expect(200);
    const { payment } = await financePaymentFixture(prisma, fixture.foreignActor);
    await mutation({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: account.body.id, expectedVersion: 0, reason: 'Intento ajeno' }).expect(404);
    expect(await prisma.financePaymentLink.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('Payment legadoUSD bloquea reporte y asignación sin sumar USD como PYG ni convertir historial', async () => {
    const account = await mutation({ type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Caja PYG', opening: { amountMinor: 0, occurredAt: financeInstant, reason: 'Apertura PYG conocida' } }).expect(200);
    const { booking, payment } = await financePaymentFixture(prisma, fixture.actor, 400000, financeInstant, 'USD');
    const original = await paymentFingerprint(prisma, booking.id);
    const response = await request(app.getHttpServer()).get(endpoint()).set('Authorization', `Bearer ${ownerToken}`).query(financePeriod).expect(409);
    expect(response.body).not.toHaveProperty('totals');
    await mutation({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: account.body.id, expectedVersion: 0, reason: 'Intento de cuenta PYG' }).expect(409);
    expect(await prisma.financePaymentLink.count()).toBe(0);
    expect(await paymentFingerprint(prisma, booking.id)).toBe(original);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).currency).toBe('USD');
  });

  it.each([0, -1, 0.1, Number.MAX_SAFE_INTEGER + 1, '900000', null])('importe inválido %s falla400 sin redondear ni escribir', async amountMinor => {
    const command = expenseCommand(fixture);
    await mutation({ ...command, amountMinor, lines: [{ ...command.lines[0], amountMinor }] }).expect(400);
    expect(await prisma.financeExpense.count()).toBe(0);
    expect(await prisma.financeRequest.count()).toBe(0);
  });

  it('rechaza suma distinta por1, overflow acumulado, fecha inexistente y moneda/campos desconocidos', async () => {
    const command = expenseCommand(fixture, 100001);
    const line = command.lines[0];
    await mutation({ ...command, lines: [{ ...line, amountMinor: 60000 }, { ...line, amountMinor: 40000 }] }).expect(400);
    await mutation({ ...command, amountMinor: Number.MAX_SAFE_INTEGER, lines: [{ ...line, amountMinor: Number.MAX_SAFE_INTEGER }, { ...line, amountMinor: 1 }] }).expect(400);
    await mutation({ ...command, consumedOn: '2026-02-30' }).expect(400);
    await mutation({ ...command, currency: 'USD' }).expect(400);
    await mutation({ ...command, recordedByUserId: fixture.foreignOwner.id }).expect(400);
    expect(await prisma.financeExpense.count()).toBe(0);
  });

  it('llave obligatoria y retry concurrente dan un resultado; payload modificado con misma llave409', async () => {
    const command = expenseCommand(fixture);
    await request(app.getHttpServer()).post(`${endpoint()}/commands`).set('Authorization', `Bearer ${ownerToken}`).send(command).expect(400);
    const key = randomUUID();
    const results = await Promise.all([mutation(command, key).expect(200), mutation(command, key).expect(200)]);
    expect(results[0].body).toEqual(results[1].body);
    await mutation({ ...command, description: 'Otra intención' }, key).expect(409);
    const recovered = await mutation(command, key).expect(200);
    expect(recovered.body).toEqual(results[0].body);
    expect(await prisma.financeExpense.count()).toBe(1);
    expect(JSON.stringify(recovered.body)).not.toMatch(/fingerprint|idempotencyKey/u);
  });

  it('export CSV neutraliza fórmula textual y token viejo requiere refrescar explícitamente', async () => {
    const command = expenseCommand(fixture);
    command.description = '=HYPERLINK("https://invalid.test","QA")';
    command.reference = '@SUM(1,2)';
    await mutation(command).expect(200);
    const value = await report();
    const exported = await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...financePeriod, token: value.token }).expect(200);
    const expense = csvRows(exported.text).find(row => row.recordType === 'EXPENSE');
    expect(expense?.description).toBe(`'${command.description}`);
    expect(expense?.reference).toBe(`'${command.reference}`);
    await mutation({ type: 'SET_EVIDENCE', id: value.expenses[0].id, expectedVersion: 1, reference: 'Otra evidencia', reason: 'Corregir referencia' }).expect(200);
    await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...financePeriod, token: value.token }).expect(409);
  });

  it('CSV permite reconstruir caja octubre con fuentes anteriores sin atribuir cobros al período', async () => {
    const account = await mutation({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco anual', opening: { amountMinor: 1000000, occurredAt: '2026-01-01T12:00:00Z', reason: 'Apertura enero' } }).expect(200);
    const { payment } = await financePaymentFixture(prisma, fixture.actor, 400000, '2026-02-01T12:00:00Z');
    await mutation({ type: 'LINK_PAYMENT', paymentId: payment.id, accountId: account.body.id, expectedVersion: 0, reason: 'Cobro febrero' }).expect(200);
    const period = { from: '2026-10-01', to: '2026-11-01' };
    const response = await request(app.getHttpServer()).get(endpoint()).set('Authorization', `Bearer ${ownerToken}`).query(period).expect(200);
    const value = response.body as FinanceReport;
    expect(value.totals).toMatchObject({ paymentsMinor: 0, registeredBalanceMinor: 1400000 });
    const csv = await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...period, token: value.token }).expect(200);
    const rows = csvRows(csv.text);
    expect(rows.filter(row => row.recordType === 'PAYMENT')).toEqual([]);
    const balanceRows = rows.filter(row => row.recordType === 'BALANCE_SOURCE');
    expect(balanceRows.reduce((sum, row) => sum + Number(row.amountMinor), 0)).toBe(1400000);
    expect(balanceRows.find(row => row.sourceType === 'PAYMENT')).toMatchObject({ sourceId: payment.id, amountMinor: '400000', includedInBalance: 'true' });
  });

  it('más de 5000 fuentes responde409 en reporte y CSV sin conjunto truncado ni éxito parcial', async () => {
    await prisma.financeCatalog.createMany({ data: Array.from({ length: 5001 }, (_value, index) => ({ businessId: fixture.business.id, kind: 'CATEGORY', name: `QA volumen ${index}` })) });
    const response = await request(app.getHttpServer()).get(endpoint()).set('Authorization', `Bearer ${ownerToken}`).query(financePeriod).expect(409);
    expect(response.body).not.toHaveProperty('expenses');
    expect(response.body).not.toHaveProperty('totals');
    const csv = await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...financePeriod, token: 'a'.repeat(64) }).expect(409);
    expect(csv.headers['content-type']).not.toContain('text/csv');
    expect(csv.text).not.toContain('QA volumen');
  });

  it('auditoría de fuente y revisión muestran actor, instante y motivo con roles y tenant vigentes', async () => {
    const account = await mutation({ type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Caja auditada', opening: { amountMinor: 0, occurredAt: financeInstant, reason: 'Apertura conocida' } }).expect(200);
    const movement = await mutation({ type: 'CASH_MOVEMENT', accountId: account.body.id, kind: 'CONTRIBUTION', amountMinor: 300000, occurredAt: '2026-10-02T12:00:00Z', reason: 'Aporte ya efectuado', openingId: null }).expect(200);
    await mutation({ type: 'REVIEW_MOVEMENT', sourceType: 'MOVEMENT', sourceId: movement.body.id, sourceVersion: 1, expectedVersion: 0, reviewed: true, reason: 'Evidencia cotejada manualmente' }).expect(200);
    const value = await report();
    const reviewed = value.movements.find(row => row.sourceId === movement.body.id);
    expect(reviewed).toMatchObject({ reviewed: true, reviewStale: false, reviewDetails: { actorUserId: fixture.users.OWNER.id, reason: 'Evidencia cotejada manualmente', occurredAt: expect.any(String) } });
    expect(new Date(reviewed!.reviewDetails!.occurredAt).toISOString()).toBe(reviewed!.reviewDetails!.occurredAt);
    const auditPath = `${endpoint()}/audit/MOVEMENT/${movement.body.id}`;
    const audit = await request(app.getHttpServer()).get(auditPath).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(Array.isArray(audit.body)).toBe(true);
    expect(audit.body.map((entry: { action: string }) => entry.action)).toEqual(expect.arrayContaining(['CASH_MOVEMENT', 'REVIEW_MOVEMENT']));
    for (const entry of audit.body as { actorUserId: string; occurredAt: string; details: unknown }[]) {
      expect(entry.actorUserId).toBe(fixture.users.OWNER.id);
      expect(new Date(entry.occurredAt).toISOString()).toBe(entry.occurredAt);
      expect(entry.details).toEqual(expect.any(Object));
    }
    expect(audit.text).toContain('Evidencia cotejada manualmente');
    expect(audit.text).not.toMatch(/fingerprint|idempotencyKey/u);
    for (const role of ['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const) {
      const token = await realFinanceToken(app, fixture.users[role].id);
      await request(app.getHttpServer()).get(auditPath).set('Authorization', `Bearer ${token}`).expect(403);
    }
    const foreignToken = await realFinanceToken(app, fixture.foreignOwner.id);
    const foreignAccount = await mutation({ type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Caja ajena', opening: { amountMinor: 0, occurredAt: financeInstant, reason: 'Apertura propia ajena' } }, randomUUID(), foreignToken, fixture.foreignBusiness.id).expect(200);
    const foreign = await mutation({ type: 'CASH_MOVEMENT', accountId: foreignAccount.body.id, kind: 'CONTRIBUTION', amountMinor: 1, occurredAt: financeInstant, reason: 'Privado ajeno', openingId: null }, randomUUID(), foreignToken, fixture.foreignBusiness.id).expect(200);
    const crossTenant = await request(app.getHttpServer()).get(`${endpoint()}/audit/MOVEMENT/${foreign.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(404);
    const missing = await request(app.getHttpServer()).get(`${endpoint()}/audit/MOVEMENT/${randomUUID()}`).set('Authorization', `Bearer ${ownerToken}`).expect(404);
    expect(crossTenant.body).toEqual(missing.body);
    expect(crossTenant.text).not.toContain('Privado ajeno');
    await request(app.getHttpServer()).get(`${endpoint()}/audit/UNKNOWN/${movement.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(400);
  });

  it('consumedOn es fecha pura; vencimiento hoy/null no es vencido, ayer sí', async () => {
    const localToday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const yesterday = new Date(`${localToday}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const base = { ...expenseCommand(fixture), consumedOn: localToday };
    const today = await mutation({ ...base, dueOn: localToday }).expect(200);
    const withoutDue = await mutation({ ...base, dueOn: null }).expect(200);
    const past = await mutation({ ...base, dueOn: yesterday.toISOString().slice(0, 10) }).expect(200);
    const value = await report();
    expect(value.expenses.find(row => row.id === today.body.id)).toMatchObject({ consumedOn: localToday, dueOn: localToday, overdue: false });
    expect(value.expenses.find(row => row.id === withoutDue.body.id)).toMatchObject({ overdue: false, dueOn: null });
    expect(value.expenses.find(row => row.id === past.body.id)).toMatchObject({ overdue: true });
    const persisted = await prisma.financeExpense.findUniqueOrThrow({ where: { id: today.body.id } });
    expect(persisted.consumedOn.toISOString()).toBe(`${localToday}T00:00:00.000Z`);
  });

  it('Business archivado conserva lectura/detail/export y bloquea toda nueva escritura', async () => {
    const expense = await mutation(expenseCommand(fixture)).expect(200);
    await prisma.business.update({ where: { id: fixture.business.id }, data: { status: 'ARCHIVED' } });
    const value = await report();
    expect(value.expenses.map(row => row.id)).toEqual([expense.body.id]);
    await request(app.getHttpServer()).get(`${endpoint()}/expenses/${expense.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    await request(app.getHttpServer()).get(`${endpoint()}/export`).set('Authorization', `Bearer ${ownerToken}`).query({ ...financePeriod, token: value.token }).expect(200);
    await mutation({ type: 'CREATE_CATALOG', kind: 'CATEGORY', name: 'No permitida' }).expect(409);
  });

  it('Business suspendido conserva lectura histórica y deniega registro con409 sin efectos', async () => {
    await mutation(expenseCommand(fixture)).expect(200);
    await prisma.business.update({ where: { id: fixture.business.id }, data: { status: 'SUSPENDED' } });
    expect((await report()).totals.outstandingMinor).toBe(900000);
    await mutation(expenseCommand(fixture)).expect(409);
    expect(await prisma.financeExpense.count()).toBe(1);
  });

  it('HTTP400 protege saldo acumulado aunque cada importe individual sea entero seguro', async () => {
    const account = await mutation({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Límite exacto', opening: { amountMinor: Number.MAX_SAFE_INTEGER, occurredAt: financeInstant, reason: 'Apertura de borde sintética' } }).expect(200);
    await mutation({ type: 'CASH_MOVEMENT', accountId: account.body.id, kind: 'CONTRIBUTION', amountMinor: 1, occurredAt: '2026-10-02T12:00:00Z', reason: 'Overflow acumulado', openingId: null }).expect(400);
    expect(await prisma.financeCashMovement.count()).toBe(0);
    expect((await report()).accounts[0].balanceMinor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('primer hechoFinance vs cambio timezone se serializan y nunca reinterpreta el hecho confirmado', async () => {
    // Este Business no tiene Resource, Booking, Block ni Payment: Finance es la única guarda.
    const emptyBusiness = await prisma.business.create({ data: { name: 'Finance-only timezone QA', timezone: 'America/Asuncion', currency: 'PYG' } });
    await prisma.userBusinessMembership.create({ data: { userId: fixture.users.OWNER.id, businessId: emptyBusiness.id, role: 'OWNER' } });
    const command: FinanceCommand = { type: 'CREATE_ACCOUNT', kind: 'CASH', name: 'Primera caja', opening: { amountMinor: 1000000, occurredAt: financeInstant, reason: 'Primer hecho' } };
    const attempts = await Promise.all([
      mutation(command, randomUUID(), ownerToken, emptyBusiness.id),
      request(app.getHttpServer()).patch(`/api/businesses/${emptyBusiness.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedUpdatedAt: emptyBusiness.updatedAt.toISOString(), timezone: 'America/New_York' }),
    ]);
    expect(attempts[0].status).toBe(200);
    expect([200, 400, 409]).toContain(attempts[1].status);
    const persisted = await prisma.business.findUniqueOrThrow({ where: { id: emptyBusiness.id } });
    const second = await request(app.getHttpServer()).patch(`/api/businesses/${emptyBusiness.id}`).set('Authorization', `Bearer ${ownerToken}`).send({ expectedUpdatedAt: persisted.updatedAt.toISOString(), timezone: persisted.timezone === 'America/Asuncion' ? 'America/New_York' : 'America/Asuncion' }).expect(400);
    expect(second.body.message).toEqual(expect.any(String));
    expect(await prisma.financeOpening.count({ where: { businessId: emptyBusiness.id } })).toBe(1);
    if (attempts[1].status === 200) expect(persisted.timezone).toBe('America/New_York');
    else expect(persisted.timezone).toBe('America/Asuncion');
  });
});
