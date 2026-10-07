import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { After, Before, Given, Then, When } from '@cucumber/cucumber';
import type { MembershipRole, PrismaClient } from '@prisma/client';
import request, { type Response } from 'supertest';
import { PrismaService } from '../../../src/modules/business/business.contract';
import type { FinanceCommand, FinanceReport } from '../../../src/modules/finance/domain/finance.types';
import { TopWorld } from '../support/world';
import {
  closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, financeInstant, financePeriod,
  realFinanceToken, resetFinanceDatabase, type FinanceFixture,
} from '../../fixtures/finance-fixture';

interface FinanceWorld extends TopWorld {
  financePrisma: PrismaClient;
  financeFixture: FinanceFixture;
  financeToken: string;
  financeExpenseId: string;
  financeAccountId: string;
  financeCountId: string;
  financeKey: string;
  financeResponses: Response[];
  financeReport: FinanceReport;
}

function endpoint(world: FinanceWorld): string {
  return `/api/businesses/${world.financeFixture.business.id}/finance`;
}

function mutate(world: FinanceWorld, command: FinanceCommand, key: string = randomUUID(), token = world.financeToken) {
  return request(world.app!.getHttpServer()).post(`${endpoint(world)}/commands`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(command);
}

async function report(world: FinanceWorld): Promise<FinanceReport> {
  const response = await request(world.app!.getHttpServer()).get(endpoint(world)).set('Authorization', `Bearer ${world.financeToken}`).query(financePeriod).expect(200);
  return response.body as FinanceReport;
}

Before({ tags: '@financeReal', timeout: 20000 }, async function (this: FinanceWorld) {
  this.app = await createFinanceApp();
  this.financePrisma = this.app.get(PrismaService);
  await resetFinanceDatabase(this.financePrisma);
  this.financeFixture = await financeFixture(this.financePrisma);
  this.financeToken = await realFinanceToken(this.app, this.financeFixture.users.OWNER.id);
});

After({ tags: '@financeReal', timeout: 20000 }, async function (this: FinanceWorld) {
  try { if (this.financePrisma) await resetFinanceDatabase(this.financePrisma); }
  finally { if (this.app) await closeFinanceApp(this.app); }
});

Given('FIN el dueño tiene dos negocios sintéticos aislados', function (this: FinanceWorld) {
  assert.notEqual(this.financeFixture.business.id, this.financeFixture.foreignBusiness.id);
  assert.ok(this.financeToken.split('.').length === 3);
});

Given('FIN declara apertura de {word} por {int}', async function (this: FinanceWorld, kind: string, amountMinor: number) {
  const response = await mutate(this, { type: 'CREATE_ACCOUNT', kind: kind === 'caja' ? 'CASH' : 'BANK', name: 'Cuenta sintética Gherkin', opening: { amountMinor, occurredAt: financeInstant, reason: 'Apertura explícita conocida' } }).expect(200);
  this.financeAccountId = response.body.id as string;
});

When('FIN registra una reparación de {int} consumida el 30 de septiembre', async function (this: FinanceWorld, amountMinor: number) {
  const response = await mutate(this, expenseCommand(this.financeFixture, amountMinor)).expect(200);
  this.financeExpenseId = response.body.id as string;
});

When('FIN registra pago externo de {int} contra la reparación', async function (this: FinanceWorld, amountMinor: number) {
  await mutate(this, { type: 'SETTLE_EXPENSE', id: this.financeExpenseId, expectedVersion: 1, settlement: { accountId: this.financeAccountId, amountMinor, occurredAt: '2026-10-02T12:00:00Z', reference: 'Pago realizado fuera de TOP' } }).expect(200);
});

Then('FIN el costo operativo es {int} y la obligación es {int}', async function (this: FinanceWorld, cost: number, debt: number) {
  const value = await report(this);
  assert.equal(value.totals.operatingCostMinor, cost);
  assert.equal(value.totals.outstandingMinor, debt);
  assert.equal(value.expenses.reduce((sum, expense) => sum + expense.outstandingMinor, 0), debt);
});

Then('FIN no hay pagos de obligación ni cuenta con saldo conocido', async function (this: FinanceWorld) {
  const value = await report(this);
  assert.equal(value.totals.settlementsMinor, 0);
  assert.equal(value.totals.registeredBalanceMinor, null);
  assert.equal(value.movements.length, 0);
  assert.equal(value.accounts.length, 0);
});

Then('FIN el saldo registrado de banco es {int}', async function (this: FinanceWorld, balance: number) {
  const value = await report(this);
  assert.equal(value.accounts.find(account => account.id === this.financeAccountId)?.balanceMinor, balance);
});

Then('FIN el detalle y CSV reproducen el mismo corte económico', async function (this: FinanceWorld) {
  const value = await report(this);
  const detail = await request(this.app!.getHttpServer()).get(`${endpoint(this)}/expenses/${this.financeExpenseId}`).set('Authorization', `Bearer ${this.financeToken}`).expect(200);
  assert.equal(detail.body.expense.outstandingMinor, 600000);
  const csv = await request(this.app!.getHttpServer()).get(`${endpoint(this)}/export`).set('Authorization', `Bearer ${this.financeToken}`).query({ ...financePeriod, token: value.token }).expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/u);
  assert.ok(csv.text.includes(this.financeExpenseId));
  assert.ok(csv.text.includes('"TOTAL","","outstandingMinor"'));
  assert.ok(csv.text.includes('"600000"'));
  assert.ok(csv.text.includes(value.token));
});

When('FIN registra la misma reparación dos veces con una llave de intención', async function (this: FinanceWorld) {
  this.financeKey = randomUUID();
  const command = expenseCommand(this.financeFixture);
  this.financeResponses = await Promise.all([mutate(this, command, this.financeKey).expect(200), mutate(this, command, this.financeKey).expect(200)]);
  assert.deepEqual(this.financeResponses[0].body, this.financeResponses[1].body);
  this.financeExpenseId = this.financeResponses[0].body.id as string;
});

Then('FIN existe un solo documento y una sola auditoría de alta', async function (this: FinanceWorld) {
  assert.equal(await this.financePrisma.financeExpense.count(), 1);
  assert.equal(await this.financePrisma.financeAudit.count({ where: { sourceId: this.financeExpenseId } }), 1);
});

Then('FIN cambiar el importe con la misma llave da conflicto', async function (this: FinanceWorld) {
  await mutate(this, expenseCommand(this.financeFixture, 800000), this.financeKey).expect(409);
  assert.equal((await report(this)).totals.expenseMinor, 900000);
});

When('FIN un usuario {word} intenta leer escribir y exportar Finanzas', async function (this: FinanceWorld, role: MembershipRole) {
  const token = await realFinanceToken(this.app!, this.financeFixture.users[role].id);
  this.financeResponses = [
    await request(this.app!.getHttpServer()).get(endpoint(this)).set('Authorization', `Bearer ${token}`).query(financePeriod),
    await mutate(this, expenseCommand(this.financeFixture), randomUUID(), token),
    await request(this.app!.getHttpServer()).get(`${endpoint(this)}/export`).set('Authorization', `Bearer ${token}`).query({ ...financePeriod, token: 'unavailable' }),
  ];
});

Then('FIN las tres acciones son denegadas sin registro financiero', async function (this: FinanceWorld) {
  assert.deepEqual(this.financeResponses.map(response => response.status), [403, 403, 403]);
  assert.equal(await this.financePrisma.financeExpense.count(), 0);
  assert.equal(await this.financePrisma.financeRequest.count(), 0);
});

When('FIN intenta registrar reparación con contraparte ajena', async function (this: FinanceWorld) {
  this.response = await mutate(this, { ...expenseCommand(this.financeFixture), counterpartyId: this.financeFixture.foreignCounterparty.id });
});

Then('FIN recibe el mismo no encontrado que para una contraparte inexistente', async function (this: FinanceWorld) {
  assert.equal(this.response!.status, 404);
  const missing = await mutate(this, { ...expenseCommand(this.financeFixture), counterpartyId: randomUUID() }).expect(404);
  assert.deepEqual(this.response!.body, missing.body);
  assert.ok(!JSON.stringify(this.response!.body).includes(this.financeFixture.foreignCounterparty.id));
});

Then('FIN no hay documentos líneas ni aplicaciones parciales', async function (this: FinanceWorld) {
  assert.equal(await this.financePrisma.financeExpense.count(), 0);
  assert.equal(await this.financePrisma.financeExpenseLine.count(), 0);
  assert.equal(await this.financePrisma.financeSettlement.count(), 0);
});

When('FIN cuenta efectivo por {int}', async function (this: FinanceWorld, countedAmountMinor: number) {
  const response = await mutate(this, { type: 'COUNT_CASH', accountId: this.financeAccountId, countedAmountMinor, occurredAt: '2026-10-02T12:00:00Z', reason: 'Conteo físico real sintético' }).expect(200);
  this.financeCountId = response.body.id as string;
});

Then('FIN observa diferencia de {int} y saldo registrado de {int}', async function (this: FinanceWorld, difference: number, balance: number) {
  const value = await report(this);
  assert.equal(value.cashCounts.find(count => count.id === this.financeCountId)?.differenceMinor, difference);
  assert.equal(value.totals.registeredBalanceMinor, balance);
});

When('FIN registra el ajuste explicado dos veces con una llave', async function (this: FinanceWorld) {
  const command = { type: 'ADJUST_COUNT', id: this.financeCountId, expectedVersion: 1, reason: 'Faltante explicado' } as const;
  const key = randomUUID();
  const first = await mutate(this, command, key).expect(200);
  const retry = await mutate(this, command, key).expect(200);
  assert.deepEqual(retry.body, first.body);
  assert.equal(await this.financePrisma.financeCashMovement.count(), 1);
});

When('FIN conserva el corte y después corrige la referencia de evidencia', async function (this: FinanceWorld) {
  this.financeReport = await report(this);
  await mutate(this, { type: 'SET_EVIDENCE', id: this.financeExpenseId, expectedVersion: 1, reference: 'Comprobante incorporado después del corte', reason: 'Completar evidencia' }).expect(200);
});

Then('FIN exportar el corte anterior da conflicto sin archivo', async function (this: FinanceWorld) {
  const response = await request(this.app!.getHttpServer()).get(`${endpoint(this)}/export`).set('Authorization', `Bearer ${this.financeToken}`).query({ ...financePeriod, token: this.financeReport.token }).expect(409);
  assert.ok(!response.headers['content-type'].includes('text/csv'));
});
