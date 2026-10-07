import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import type { MembershipRole } from '@prisma/client';
import type { FinanceAging, FinanceCashProjection } from '../../../src/modules/finance/domain/finance-v2.types';
import type { FinanceAlertsReadResult } from '../../../src/modules/finance/infrastructure/finance-v2-alerts.read-service';
import { realFinanceToken } from '../../fixtures/finance-fixture';
import { analysisClock, analysisShiftDay } from './finance-analysis-planning.dates';
import { commonCost, allocateCommon, allocationGolden, allocationRetry, resourceGolden, laborEstimate, replaceLabor, unknownLabor } from './finance-analysis-planning.costs';
import { analysisCompare, analysisCosts, analysisCounts, analysisCut, analysisDefinition, analysisExpense, analysisGet, analysisMonth, analysisNoFields, analysisPost, analysisCommitment, type AnalysisWorld } from './finance-analysis-planning.support';

Given('AN existe el harness financiero real con OWNER vigente y dos negocios aislados', function (this: AnalysisWorld) {
  assert.ok(this.app); assert.ok(this.financePrisma); assert.equal(this.financeToken.split('.').length, 3);
  assert.notEqual(this.financeFixture.business.id, this.financeFixture.foreignBusiness.id);
});
Given('AN registra un costo común de {int} y dos recursos propios', async function (this: AnalysisWorld, amount: number) { await commonCost(this, amount); });
When('AN asigna 50 por ciento al primer recurso y 25 por ciento al segundo', async function (this: AnalysisWorld) { await allocateCommon(this); });
Then('AN observa destinos {int} y {int} más {int} sin asignar', async function (this: AnalysisWorld, first: number, second: number, remainder: number) { await allocationGolden(this, first, second, remainder); });
Then('AN repetir la intención conserva una asignación y otra intención con versión vieja responde 409', async function (this: AnalysisWorld) { await allocationRetry(this); });
When('AN registra costo directo de {int} contra el recurso certificado', async function (this: AnalysisWorld, amount: number) { await analysisExpense(this, amount); });
Then('AN septiembre conserva ingreso certificado 600000 y costo total 600001 con resultado -1', async function (this: AnalysisWorld) { await resourceGolden(this); });
Then('AN el recurso certificado obtiene 250000 y los otros costos quedan en sus destinos', async function (this: AnalysisWorld) { await resourceGolden(this); });
Given('AN registra personal estimado de {int}', async function (this: AnalysisWorld, amount: number) { await laborEstimate(this, amount); });
When('AN lo sustituye con documento real de {int} y declara trabajo OWNER de {int}', async function (this: AnalysisWorld, actual: number, owner: number) { await replaceLabor(this, actual, owner); });
Then('AN observa costo real {int} estimación seleccionada {int} y trabajo OWNER {int}', async function (this: AnalysisWorld, actual: number, estimate: number, owner: number) {
  const report = await analysisCosts(this);
  assert.equal(report.totals.actualCostMinor, actual); assert.equal(report.totals.estimatedSelectedMinor, estimate); assert.equal(report.totals.ownerImputedMinor, owner);
  assert.equal(report.rows.filter(value => value.expenseLineId === this.anLineId).length, 1);
});
Then('AN un personal sin importe conserva null y cobertura desconocida', async function (this: AnalysisWorld) { await unknownLabor(this); });

Given('AN aprueba meta mensual de {int}', async function (this: AnalysisWorld, amount: number) {
  const proposed = await analysisPost(this, 'v2/commands', { type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-09', expectedBudgetVersion: 0, lines: [{ categoryId: this.financeFixture.category.id, resourceId: this.financeFixture.resource.id, approvedMinor: amount }], reason: 'Meta manual GWT.' }).expect(200);
  this.anBudgetId = proposed.body.id as string;
  await analysisPost(this, 'v2/commands', { type: 'APPROVE_BUDGET_REVISION', id: proposed.body.relatedIds.revisionId as string, expectedBudgetVersion: 1, reason: 'OWNER aprueba esta revisión exacta.' }).expect(200);
  this.anApprovedBefore = await this.financePrisma.financeBudget.findUniqueOrThrow({ where: { id: this.anBudgetId }, include: { revisions: { include: { lines: true } } } });
});
Given('AN registra costo real de {int} y compromiso pendiente de {int}', async function (this: AnalysisWorld, actual: number, pending: number) {
  await analysisExpense(this, actual); await analysisCommitment(this, pending); this.anBefore = await analysisCounts(this);
});
When('AN consulta comparación sin elegir previsión', async function (this: AnalysisWorld) { this.anComparison = await analysisCompare(this); });
Then('AN la previsión y su desviación son null con meta 1000000 intacta', function (this: AnalysisWorld) {
  const line = this.anComparison.lines.find(value => value.resourceId === this.financeFixture.resource.id); assert.ok(line);
  assert.equal(line.approvedMinor, 1000000); assert.equal(line.actualMinor, 600000); assert.equal(line.committedPendingMinor, 600000);
  assert.equal(line.forecastMinor, null); assert.equal(line.forecastDeviationMinor, null); assert.equal(this.anComparison.scenarioToken, null);
});
When('AN elige previsión real más compromisos pendientes', async function (this: AnalysisWorld) { this.anComparison = await analysisCompare(this, true); });
Then('AN observa previsión {int} desviación {int} y ningún movimiento de caja nuevo', async function (this: AnalysisWorld, forecast: number, deviation: number) {
  const line = this.anComparison.lines.find(value => value.resourceId === this.financeFixture.resource.id); assert.ok(line);
  assert.equal(line.forecastMinor, forecast); assert.equal(line.forecastDeviationMinor, deviation); assert.equal(line.approvedMinor, 1000000);
  assert.equal(this.anComparison.forecastBasis, 'ACTUAL_PLUS_PENDING_COMMITMENTS'); assert.match(this.anComparison.scenarioToken!, /^[a-f0-9]{64}$/u);
  assert.deepEqual(await analysisCounts(this), this.anBefore);
  assert.deepEqual(await this.financePrisma.financeBudget.findUniqueOrThrow({ where: { id: this.anBudgetId }, include: { revisions: { include: { lines: true } } } }), this.anApprovedBefore);
});
Given('AN registra compromiso de {int} para septiembre', async function (this: AnalysisWorld, amount: number) { await analysisCommitment(this, amount); });
When('AN convierte {int} en gasto y repite la misma intención', async function (this: AnalysisWorld, amount: number) {
  this.anKey = randomUUID();
  this.anIntent = { type: 'CONVERT_COMMITMENT', id: this.anCommitmentId, expectedVersion: 1, expenseDraftId: null, expectedDraftVersion: null, expense: { ...analysisDefinition(this, amount), consumedOn: '2026-09-30', dueOn: '2026-10-10', settlement: null }, reason: 'Conversión parcial explícita.' };
  const first = await analysisPost(this, 'v2/commands', this.anIntent, this.anKey).expect(200), replay = await analysisPost(this, 'v2/commands', this.anIntent, this.anKey).expect(200);
  assert.deepEqual(replay.body, first.body);
});
Then('AN observa real {int} pendiente {int} y suma prevista {int}', async function (this: AnalysisWorld, actual: number, pending: number, forecast: number) {
  const comparison = await analysisCompare(this, true), row = comparison.lines.find(value => value.resourceId === this.financeFixture.resource.id); assert.ok(row);
  assert.equal(row.actualMinor, actual); assert.equal(row.committedPendingMinor, pending); assert.equal(row.forecastMinor, forecast);
  assert.equal((await this.financePrisma.financeCommitment.findUniqueOrThrow({ where: { id: this.anCommitmentId } })).version, 2);
});
Then('AN existen un gasto y una conversión sin liquidación de caja', async function (this: AnalysisWorld) {
  assert.equal(await this.financePrisma.financeExpense.count(), 1); assert.equal(await this.financePrisma.financeCommitmentConversion.count(), 1); assert.equal(await this.financePrisma.financeSettlement.count(), 0);
});
Then('AN convertir otros {int} responde 400 sin filas parciales', async function (this: AnalysisWorld, amount: number) {
  const before = await analysisCounts(this);
  await analysisPost(this, 'v2/commands', { ...this.anIntent, expectedVersion: 2, expense: { ...analysisDefinition(this, amount), consumedOn: '2026-09-30', dueOn: null, settlement: null } }).expect(400);
  assert.deepEqual(await analysisCounts(this), before);
});

Given('AN registra obligación vencida de {int}', async function (this: AnalysisWorld, amount: number) {
  const clock = await analysisClock(this);
  await analysisExpense(this, amount, this.financeFixture.resource.id, analysisShiftDay(clock.today, -35));
});
When('AN paga {int} de la obligación con fecha actual', async function (this: AnalysisWorld, amount: number) {
  await analysisPost(this, 'commands', { type: 'SETTLE_EXPENSE', id: this.anExpenseId, expectedVersion: 1, settlement: { accountId: this.financeAccountId, amountMinor: amount, occurredAt: analysisCut(), reference: 'Pago real sintético.' } }).expect(200);
});
Then('AN la antigüedad conserva sólo {int} pendientes de esa obligación', async function (this: AnalysisWorld, pending: number) {
  const aging = (await analysisGet(this, 'v2/aging').query({ asOf: analysisCut() }).expect(200)).body as FinanceAging;
  const row = aging.rows.find(value => value.expenseId === this.anExpenseId); assert.ok(row); assert.equal(row.direction, 'PAYABLE'); assert.equal(row.amountMinor, pending); assert.equal(row.bucket, 'DAYS_31_60');
});
When('AN propone salida futura de {int} desde la fuente real del servidor', async function (this: AnalysisWorld, amount: number) {
  const clock = await analysisClock(this);
  this.anBefore = await analysisCounts(this);
  this.anProjectionInput = { asOf: clock.asOf, horizonTo: analysisShiftDay(clock.today, 10), baseToken: '', accountIds: [this.financeAccountId], events: [], excludedSourceKeys: [] };
  const bootstrap = (await analysisPost(this, 'v2/planning-preview', this.anProjectionInput).expect(200)).body as FinanceCashProjection;
  assert.deepEqual(bootstrap.events, []); assert.equal(bootstrap.forecastDeltaMinor, 0);
  const source = bootstrap.sources.find(value => value.origin === 'PAYABLE'); assert.ok(source); assert.equal(source.amountMinor, amount);
  this.anProjection = (await analysisPost(this, 'v2/planning-preview', { ...this.anProjectionInput, baseToken: bootstrap.token, events: [{ sourceKey: source.sourceKey, direction: 'OUT', amountMinor: amount, expectedOn: analysisShiftDay(clock.today, 5), probabilityBasisPoints: 10000, accountId: this.financeAccountId, reason: 'Escenario elegido; todavía no se pagó.' }] }).expect(200)).body as FinanceCashProjection;
});
Then('AN observa caja registrada {int} proyección {int} y cero liquidaciones', async function (this: AnalysisWorld, registered: number, projected: number) {
  assert.equal(this.anProjection.registeredBalanceMinor, registered); assert.equal(this.anProjection.projectedBalanceMinor, projected); assert.equal(this.anProjection.forecastDeltaMinor, -900000);
  assert.equal(await this.financePrisma.financeSettlement.count(), 0); assert.deepEqual(await analysisCounts(this), this.anBefore);
});
Then('AN refrescar sin escenario conserva proyección base {int}', async function (this: AnalysisWorld, balance: number) {
  const fresh = (await analysisPost(this, 'v2/planning-preview', this.anProjectionInput).expect(200)).body as FinanceCashProjection;
  assert.deepEqual(fresh.events, []); assert.equal(fresh.registeredBalanceMinor, balance); assert.equal(fresh.projectedBalanceMinor, balance); assert.deepEqual(await analysisCounts(this), this.anBefore);
});

When('AN consulta dos veces las alertas del mismo corte', async function (this: AnalysisWorld) {
  const query = { ...analysisMonth, asOf: analysisCut() }; this.anAlertReads = [];
  for (let index = 0; index < 2; index += 1) this.anAlertReads.push((await analysisGet(this, 'v2/alerts').query(query).expect(200)).body as FinanceAlertsReadResult);
});
Then('AN la alerta vencida conserva su identidad y destino de gasto', function (this: AnalysisWorld) {
  const rows = this.anAlertReads.map(value => value.items.find(row => row.kind === 'OVERDUE_PAYABLE' && row.sourceId === this.anExpenseId)); assert.ok(rows[0] && rows[1]);
  assert.equal(rows[0].id, rows[1].id); assert.equal(rows[0].amountMinor, 900000); assert.deepEqual(rows[0].target, { type: 'EXPENSE', id: this.anExpenseId }); this.anAlertId = rows[0].id;
});
Then('AN refrescar elimina esa alerta porque el saldo pendiente es cero', async function (this: AnalysisWorld) {
  const alerts = (await analysisGet(this, 'v2/alerts').query({ ...analysisMonth, asOf: analysisCut() }).expect(200)).body as FinanceAlertsReadResult;
  assert.equal(alerts.items.some(value => value.id === this.anAlertId || (value.kind === 'OVERDUE_PAYABLE' && value.sourceId === this.anExpenseId)), false);
  const aging = (await analysisGet(this, 'v2/aging').query({ asOf: analysisCut() }).expect(200)).body as FinanceAging;
  assert.equal(aging.rows.some(value => value.expenseId === this.anExpenseId), false);
});
Then('AN las alertas conservan la noche 30 de septiembre pendiente de esa reserva', async function (this: AnalysisWorld) {
  const alerts = (await analysisGet(this, 'v2/alerts').query({ ...analysisMonth, asOf: analysisCut() }).expect(200)).body as FinanceAlertsReadResult;
  const night = alerts.items.find(value => value.kind === 'PENDING_SERVICE_EVIDENCE' && value.target.type === 'SERVICE_NIGHT' && value.target.bookingId === this.recBookingId && value.target.localNight === '2026-09-30');
  assert.ok(night); assert.equal(night.amountMinor, null); assert.equal(await this.financePrisma.financeServiceUnit.count(), 1);
});

When('AN un usuario {word} consulta costos presupuesto alertas y proyección', async function (this: AnalysisWorld, role: MembershipRole) {
  const token = await realFinanceToken(this.app!, this.financeFixture.users[role].id), clock = await analysisClock(this); this.anBefore = await analysisCounts(this);
  this.anResponses = [await analysisGet(this, 'v2/costs', token).query({ ...analysisMonth, asOf: clock.asOf }), await analysisGet(this, 'v2/budget-comparison', token).query({ periodMonth: '2026-09' }), await analysisGet(this, 'v2/alerts', token).query({ ...analysisMonth, asOf: clock.asOf }), await analysisPost(this, 'v2/planning-preview', { asOf: clock.asOf, horizonTo: analysisShiftDay(clock.today, 10), baseToken: '', accountIds: [], events: [], excludedSourceKeys: [] }, randomUUID(), token)];
});
Then('AN las cuatro acciones responden 403 sin campos financieros ni escrituras', async function (this: AnalysisWorld) {
  assert.deepEqual(this.anResponses.map(value => value.status), [403, 403, 403, 403]); this.anResponses.forEach(analysisNoFields); assert.deepEqual(await analysisCounts(this), this.anBefore);
});
When('AN intenta una regla con el recurso ajeno', async function (this: AnalysisWorld) {
  this.anBefore = await analysisCounts(this);
  this.response = await analysisPost(this, 'v2/commands', { type: 'CREATE_ALLOCATION_RULE', name: 'Regla rechazada por tenant', validFrom: '2026-09-01', validTo: null, parts: [{ resourceId: this.financeFixture.foreignResource.id, basisPoints: 10000 }] });
});
Then('AN recibe 404 sin regla asignación request ni datos ajenos', async function (this: AnalysisWorld) {
  assert.equal(this.response!.status, 404); assert.equal(await this.financePrisma.financeAllocationRule.count(), 0); assert.deepEqual(await analysisCounts(this), this.anBefore); assert.equal(JSON.stringify(this.response!.body).includes(this.financeFixture.foreignResource.id), false);
});
Given('AN conserva su JWT y se revoca su membresía OWNER', async function (this: AnalysisWorld) {
  this.anClock = await analysisClock(this);
  await this.financePrisma.userBusinessMembership.delete({ where: { userId_businessId: { userId: this.financeFixture.users.OWNER.id, businessId: this.financeFixture.business.id } } }); this.anBefore = await analysisCounts(this);
});
When('AN consulta alertas y proyección con ese JWT', async function (this: AnalysisWorld) {
  this.anResponses = [await analysisGet(this, 'v2/alerts').query({ ...analysisMonth, asOf: this.anClock.asOf }), await analysisPost(this, 'v2/planning-preview', { asOf: this.anClock.asOf, horizonTo: analysisShiftDay(this.anClock.today, 10), baseToken: '', accountIds: [], events: [], excludedSourceKeys: [] })];
});
Then('AN ambas acciones responden 403 sin escrituras financieras', async function (this: AnalysisWorld) {
  assert.deepEqual(this.anResponses.map(value => value.status), [403, 403]); this.anResponses.forEach(analysisNoFields); assert.deepEqual(await analysisCounts(this), this.anBefore);
});
