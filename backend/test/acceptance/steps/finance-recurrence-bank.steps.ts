import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import type { MembershipRole } from '@prisma/client';
import request from 'supertest';
import type { FinanceBankMatchDto, FinanceBankMatchPreview, FinanceBankMatchPreviewInput, FinanceBankStatementPreview, FinanceExpenseDraftDto, FinanceV2Page } from '../../../src/modules/finance/domain/finance-v2.types';
import { realFinanceToken } from '../../fixtures/finance-fixture';
import { bankComponent, bankSources, costDefinition, createV2Bank, financeRoot, originalPaymentFacts, paidBooking, selectedStatement, v2Command, v2Get, v2Post, v2Report, type FinanceV2AcceptanceWorld } from './finance-v2-acceptance.helper';

Given('RB el OWNER dispone de dos negocios sintéticos aislados', function (this: FinanceV2AcceptanceWorld) {
  assert.ok(this.app); assert.ok(this.financePrisma);
  assert.notEqual(this.financeFixture.business.id, this.financeFixture.foreignBusiness.id);
  assert.equal(this.financeToken.split('.').length, 3);
});

When('RB genera dos veces el mismo mes de una plantilla de {int}', async function (this: FinanceV2AcceptanceWorld, amountMinor: number) {
  const template = await v2Command(this, { type: 'CREATE_EXPENSE_TEMPLATE', name: 'Recurrencia mensual manual', expenseDefinition: costDefinition(this, amountMinor) }).expect(200);
  this.v2TemplateId = template.body.id as string;
  const command = { type: 'GENERATE_RECURRING_DRAFT', templateId: this.v2TemplateId, expectedTemplateVersion: 1, periodMonth: '2026-09', consumedOn: '2026-09-30', dueOn: '2026-10-10' };
  const key = randomUUID(), first = await v2Command(this, command, key).expect(200);
  assert.deepEqual((await v2Command(this, command, key).expect(200)).body, first.body);
  const freshIntent = await v2Command(this, command).expect(200);
  assert.equal(freshIntent.body.id, first.body.id); assert.equal(freshIntent.body.alreadyGenerated, true);
  this.v2DraftId = first.body.id as string;
  const detail = (await v2Get(this, `v2/drafts/${this.v2DraftId}`).expect(200)).body as { draft: FinanceExpenseDraftDto };
  assert.ok(detail.draft.templateRevisionId); this.v2TemplateRevisionId = detail.draft.templateRevisionId;
});

Then('RB existe un borrador y ningún gasto ni pago', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(await this.financePrisma.financeExpenseDraft.count(), 1); assert.equal(await this.financePrisma.financeExpense.count(), 0);
  assert.equal(await this.financePrisma.financeSettlement.count(), 0); assert.equal(await this.financePrisma.payment.count(), 0);
});

When('RB cambia la plantilla a {int} y confirma explícitamente el borrador capturado', async function (this: FinanceV2AcceptanceWorld, amountMinor: number) {
  await v2Command(this, { type: 'REVISE_EXPENSE_TEMPLATE', id: this.v2TemplateId, expectedVersion: 1, expenseDefinition: costDefinition(this, amountMinor), reason: 'La nueva plantilla aplica a generaciones futuras.' }).expect(200);
  const response = await v2Command(this, { type: 'CONFIRM_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 1, settlement: null, reason: 'Confirmación explícita del consumo.' }).expect(200);
  this.v2ExpenseId = response.body.relatedIds.expenseId as string;
  await v2Command(this, { type: 'CONFIRM_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 2, settlement: null, reason: 'No debe confirmar dos veces.' }).expect(409);
});

Then('RB el costo es 100001 y el borrador conserva su versión de plantilla original', async function (this: FinanceV2AcceptanceWorld) {
  const detail = (await v2Get(this, `v2/drafts/${this.v2DraftId}`).expect(200)).body as { draft: FinanceExpenseDraftDto };
  assert.equal(detail.draft.templateRevisionId, this.v2TemplateRevisionId); assert.equal(detail.draft.amountMinor, 100001);
  assert.equal(detail.draft.state, 'CONFIRMED'); assert.equal((await v2Report(this)).totals.operatingCostMinor, 100001);
  assert.equal(await this.financePrisma.financeExpense.count(), 1);
});

Given('RB activa aprobación por otro actor y registra un segundo OWNER', async function (this: FinanceV2AcceptanceWorld) {
  const owner = await this.financePrisma.user.create({ data: { email: `second-owner-${randomUUID()}@top.test`, emailVerifiedAt: new Date('2026-01-01') } });
  await this.financePrisma.userBusinessMembership.create({ data: { userId: owner.id, businessId: this.financeFixture.business.id, role: 'OWNER' } });
  this.v2SecondOwnerId = owner.id; this.v2SecondToken = await realFinanceToken(this.app!, owner.id);
  const policy = await v2Command(this, { type: 'SET_EXPENSE_APPROVAL_POLICY', expectedPolicyVersion: 0, enabled: true, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true, reason: 'El dueño activa explícitamente separación de actores.' }).expect(200);
  this.v2PolicyId = policy.body.id as string;
});

When('RB presenta un borrador de 900000 e intenta autoaprobarlo', async function (this: FinanceV2AcceptanceWorld) {
  const draft = await v2Command(this, { type: 'CREATE_EXPENSE_DRAFT', expenseDefinition: costDefinition(this, 900000), consumedOn: '2026-09-30', dueOn: null }).expect(200);
  this.v2DraftId = draft.body.id as string;
  await v2Command(this, { type: 'CONFIRM_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 1, settlement: null, reason: 'Aún falta aprobación.' }).expect(409);
  await v2Command(this, { type: 'SUBMIT_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 1, expectedPolicyVersion: 1, reason: 'Creador solicita revisión del otro dueño.' }).expect(200);
  this.response = await v2Command(this, { type: 'DECIDE_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 2, policyRevisionId: this.v2PolicyId, decision: 'APPROVE', reason: 'Autoaprobación intentada.' }).expect(403);
});

Then('RB la autoaprobación responde 403 sin decisión ni gasto', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(this.response!.status, 403); assert.equal(await this.financePrisma.financeDraftDecision.count(), 0); assert.equal(await this.financePrisma.financeExpense.count(), 0);
});

When('RB el segundo OWNER aprueba y el creador confirma el borrador', async function (this: FinanceV2AcceptanceWorld) {
  await v2Command(this, { type: 'DECIDE_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 2, policyRevisionId: this.v2PolicyId, decision: 'APPROVE', reason: 'Segundo OWNER coteja evidencia.' }, randomUUID(), this.v2SecondToken).expect(200);
  await v2Command(this, { type: 'CONFIRM_EXPENSE_DRAFT', id: this.v2DraftId, expectedVersion: 3, settlement: null, reason: 'Confirma el consumo aprobado.' }).expect(200);
});

Then('RB hay una decisión del segundo OWNER y un solo gasto de 900000', async function (this: FinanceV2AcceptanceWorld) {
  const decisions = await this.financePrisma.financeDraftDecision.findMany();
  assert.equal(decisions.length, 1); assert.equal(decisions[0].actorUserId, this.v2SecondOwnerId);
  assert.equal(await this.financePrisma.financeExpense.count(), 1); assert.equal((await v2Report(this)).totals.operatingCostMinor, 900000);
});

Given('RB declara banco con apertura de {int}', async function (this: FinanceV2AcceptanceWorld, opening: number) {
  this.v2AccountId = await createV2Bank(this, opening);
});

When('RB registra un consumo de 900000 ya pagado externamente por la contraparte', async function (this: FinanceV2AcceptanceWorld) {
  const draft = await v2Command(this, { type: 'CREATE_REIMBURSEMENT_DRAFT', expenseDefinition: costDefinition(this, 900000), consumedOn: '2026-09-30', dueOn: '2026-10-10', creditorCounterpartyId: this.financeFixture.counterparty.id, supplierCounterpartyId: null, externallyPaidOn: '2026-09-30', privateReference: 'Pago externo previo, no nómina.' }).expect(200);
  const confirmed = await v2Command(this, { type: 'CONFIRM_EXPENSE_DRAFT', id: draft.body.id as string, expectedVersion: 1, settlement: null, reason: 'Registrar una vez el consumo ya efectuado.' }).expect(200);
  this.v2ExpenseId = confirmed.body.relatedIds.expenseId as string;
});

Then('RB hay costo 900000 deuda al acreedor 900000 y banco 1000000', async function (this: FinanceV2AcceptanceWorld) {
  const report = await v2Report(this);
  assert.equal(report.totals.operatingCostMinor, 900000); assert.equal(report.totals.outstandingMinor, 900000); assert.equal(report.totals.registeredBalanceMinor, 1000000);
  const claims = await this.financePrisma.financeReimbursementClaim.findMany();
  assert.equal(claims.length, 1); assert.equal(claims[0].creditorCounterpartyId, this.financeFixture.counterparty.id);
});

When('RB reintegra 900000 a ese acreedor con una intención repetida', async function (this: FinanceV2AcceptanceWorld) {
  const command = { type: 'REIMBURSE_EXPENSE', expenseId: this.v2ExpenseId, expectedVersion: 1, settlement: { accountId: this.v2AccountId, amountMinor: 900000, occurredAt: '2026-10-02T12:00:00Z', reference: 'Reintegro ya pagado fuera de TOP.' }, reason: 'Cancela la obligación al acreedor original.' };
  const key = randomUUID(), first = await v2Command(this, command, key).expect(200);
  assert.deepEqual((await v2Command(this, command, key).expect(200)).body, first.body);
});

Then('RB hay un solo gasto de 900000 deuda 0 y banco 100000', async function (this: FinanceV2AcceptanceWorld) {
  const report = await v2Report(this);
  assert.equal(report.totals.operatingCostMinor, 900000); assert.equal(report.totals.outstandingMinor, 0); assert.equal(report.totals.registeredBalanceMinor, 100000);
  assert.equal(await this.financePrisma.financeExpense.count(), 1); assert.equal(await this.financePrisma.financeSettlement.count(), 1); assert.equal(await this.financePrisma.financeReimbursementClaim.count(), 1);
});

async function linkedOriginal(world: FinanceV2AcceptanceWorld, amountMinor: number): Promise<string> {
  const original = await paidBooking(world, amountMinor, amountMinor);
  world.v2BookingId = original.bookingId; world.v2PaymentId = original.paymentId;
  await v2Post(world, 'commands', { type: 'LINK_PAYMENT', paymentId: original.paymentId, accountId: world.v2AccountId, expectedVersion: 0, reason: 'Cobro registrado en este banco explícitamente.' }).expect(200);
  return original.paymentId;
}

Given('RB registra un cobro original de 1000000 y lo asigna al banco', { timeout: 20000 }, async function (this: FinanceV2AcceptanceWorld) {
  this.v2PaymentIds = [await linkedOriginal(this, 1000000)];
  this.v2OriginalFacts = await originalPaymentFacts(this);
});

Given('RB registra cobros de 60000 y 40000 y los asigna al banco', { timeout: 20000 }, async function (this: FinanceV2AcceptanceWorld) {
  this.v2PaymentIds = [await linkedOriginal(this, 60000), await linkedOriginal(this, 40000)];
});

async function importStatement(world: FinanceV2AcceptanceWorld): Promise<string> {
  const account = (await v2Report(world)).accounts.find(item => item.id === world.v2AccountId)!;
  const input = { accountId: account.id, expectedAccountVersion: account.version, sourceNamespace: 'bank-acceptance', csv: world.v2Csv };
  const preview = (await v2Post(world, 'v2/bank-preview', input).expect(200)).body as FinanceBankStatementPreview;
  assert.ok(preview.previewToken); assert.deepEqual(preview.issues, []);
  const before = (await v2Report(world)).totals;
  const result = await v2Command(world, { type: 'CONFIRM_BANK_STATEMENT', ...input, previewToken: preview.previewToken, reason: 'Importar sólo evidencia del extracto.' }).expect(200);
  assert.deepEqual((await v2Report(world)).totals, before);
  return result.body.id as string;
}

When('RB importa evidencia de depósito por {int}', async function (this: FinanceV2AcceptanceWorld, amountMinor: number) {
  this.v2Csv = `externalKey,bookedOn,amountMinor,reference\ndeposito-1,2026-10-02,${amountMinor},Depósito ya registrado externamente`;
  this.v2StatementId = await importStatement(this);
});

Then('RB el extracto no cambia caja ni costo y la fila permanece sin conciliar', async function (this: FinanceV2AcceptanceWorld) {
  const report = await v2Report(this), statement = await selectedStatement(this);
  assert.equal(report.totals.registeredBalanceMinor, 1000000); assert.equal(report.totals.operatingCostMinor, 0);
  assert.equal(statement.rows[0].status, 'UNMATCHED'); assert.equal(statement.rows[0].reservedMinor, 0);
  assert.equal(await this.financePrisma.financeBankMatch.count(), 0);
});

async function matchingInput(world: FinanceV2AcceptanceWorld, rowAmount: number): Promise<FinanceBankMatchPreviewInput> {
  const statement = await selectedStatement(world), available = await bankSources(world);
  const selected = world.v2PaymentIds.map(paymentId => { const source = available.find(item => item.ref.sourceType === 'PAYMENT' && item.ref.sourceId === paymentId); assert.ok(source); return bankComponent(source); });
  return { accountId: world.v2AccountId, rows: [{ id: statement.rows[0].id, version: statement.rows[0].version, amountMinor: rowAmount }], components: selected, paymentLinks: [], fees: [], reason: 'Cotejo humano explícito de fuentes originales.' };
}

async function confirmMatching(world: FinanceV2AcceptanceWorld, input: FinanceBankMatchPreviewInput): Promise<void> {
  const preview = (await v2Post(world, 'v2/bank-match-preview', input).expect(200)).body as FinanceBankMatchPreview;
  assert.equal(preview.rowTotalMinor, preview.componentTotalMinor); assert.deepEqual(preview.staleReasons, []); assert.ok(preview.previewToken);
  const command = { type: 'CONFIRM_BANK_MATCH', ...input, previewToken: preview.previewToken }, key = randomUUID();
  const result = await v2Command(world, command, key).expect(200);
  assert.deepEqual((await v2Command(world, command, key).expect(200)).body, result.body);
  world.v2MatchId = result.body.id as string;
}

When('RB confirma matching del bruto con comisión separada de 150000 y repite la intención', async function (this: FinanceV2AcceptanceWorld) {
  const input = await matchingInput(this, 850000);
  input.fees = [{ bankRowId: input.rows[0].id, expenseDefinition: { ...costDefinition(this, 150000), description: 'Comisión bancaria real del depósito' }, consumedOn: '2026-10-02', occurredAt: '2026-10-02T12:00:00Z', reference: 'Comisión ya descontada fuera de TOP.' }];
  await confirmMatching(this, input);
});

Then('RB hay cobro bruto 1000000 costo 150000 pago 150000 y banco 850000', async function (this: FinanceV2AcceptanceWorld) {
  const report = await v2Report(this);
  assert.equal(report.totals.grossRecordedAmountMinor, 1000000); assert.equal(report.totals.operatingCostMinor, 150000); assert.equal(report.totals.settlementsMinor, 150000); assert.equal(report.totals.registeredBalanceMinor, 850000);
  assert.equal(report.totals.outstandingMinor, 0); assert.equal(await this.financePrisma.financeExpense.count(), 1); assert.equal(await this.financePrisma.financeSettlement.count(), 1); assert.equal(await this.financePrisma.payment.count(), 1); assert.equal(await this.financePrisma.financeCashMovement.count(), 0);
});

Then('RB la fila y los dos componentes suman 850000 sin alterar cobro ni aplicaciones originales', async function (this: FinanceV2AcceptanceWorld) {
  const page = (await v2Get(this, 'v2/bank-matches').query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceBankMatchDto>;
  const match = page.items.find(item => item.id === this.v2MatchId)!;
  assert.deepEqual(match.components.map(item => item.amountMinor).sort((a, b) => a - b), [-150000, 1000000]); assert.equal(match.rows[0].consumedAmountMinor, 850000);
  const row = (await selectedStatement(this)).rows[0];
  assert.equal(row.status, 'MATCHED'); assert.equal(row.residualMinor, 0); assert.equal(await originalPaymentFacts(this), this.v2OriginalFacts);
});

When('RB concilia 100000 con los dos cobros y reimporta el mismo extracto', async function (this: FinanceV2AcceptanceWorld) {
  await confirmMatching(this, await matchingInput(this, 100000));
  const previousId = this.v2StatementId;
  assert.equal(await importStatement(this), previousId);
});

Then('RB conserva un extracto una fila un matching y banco 100000', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(await this.financePrisma.financeBankStatement.count(), 1); assert.equal(await this.financePrisma.financeBankRow.count(), 1); assert.equal(await this.financePrisma.financeBankMatch.count(), 1);
  assert.equal(await this.financePrisma.payment.count(), 2); assert.equal(await this.financePrisma.financePaymentLink.count(), 2); assert.equal((await v2Report(this)).totals.registeredBalanceMinor, 100000);
});

Then('RB el residuo del extracto es 20000 y los dos cobros tienen residuo 0', async function (this: FinanceV2AcceptanceWorld) {
  const row = (await selectedStatement(this)).rows[0];
  assert.equal(row.status, 'PARTIAL'); assert.equal(row.amountMinor, 120000); assert.equal(row.reservedMinor, 100000); assert.equal(row.residualMinor, 20000);
  const sources = await bankSources(this);
  assert.deepEqual(sources.filter(item => this.v2PaymentIds.includes(item.ref.sourceId)).map(item => item.residualMinor), [0, 0]);
  const match = await this.financePrisma.financeBankMatchComponent.findMany({ where: { matchId: this.v2MatchId } });
  assert.deepEqual(match.map(item => item.amountMinor).sort((a, b) => Number(a - b)), [40000n, 60000n]);
});

When('RB un usuario {word} intenta importar extracto crear borrador y leer conciliaciones', async function (this: FinanceV2AcceptanceWorld, role: MembershipRole) {
  const token = await realFinanceToken(this.app!, this.financeFixture.users[role].id);
  this.v2RequestCount = await this.financePrisma.financeRequest.count();
  this.response = await v2Post(this, 'v2/bank-preview', { accountId: this.v2AccountId, expectedAccountVersion: 1, sourceNamespace: 'private-role-preview', csv: 'CSV privado que nunca debe analizarse' }, randomUUID(), token).expect(403);
  await v2Command(this, { type: 'CREATE_EXPENSE_DRAFT', expenseDefinition: costDefinition(this, 900000), consumedOn: '2026-09-30', dueOn: null }, randomUUID(), token).expect(403);
  await v2Get(this, 'v2/bank-matches', token).query({ limit: 100 }).expect(403);
});

Then('RB las tres acciones son denegadas sin datos de CSV ni efectos parciales', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(this.response!.body.issues, undefined); assert.equal(this.response!.body.previewToken, undefined);
  assert.equal(await this.financePrisma.financeExpenseDraft.count(), 0); assert.equal(await this.financePrisma.financeBankStatement.count(), 0); assert.equal(await this.financePrisma.financeBankMatch.count(), 0);
  assert.equal(await this.financePrisma.financeRequest.count(), this.v2RequestCount);
});

When('RB consulta fuentes con una cuenta de otro negocio', async function (this: FinanceV2AcceptanceWorld) {
  const token = await realFinanceToken(this.app!, this.financeFixture.foreignOwner.id);
  const path = `/api/businesses/${this.financeFixture.foreignBusiness.id}/finance`;
  const foreign = await request(this.app!.getHttpServer()).post(`${path}/commands`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco ajeno sintético', opening: { amountMinor: 7000000, occurredAt: '2026-10-01T00:00:00Z', reason: 'Apertura explícita de otro negocio.' } }).expect(200);
  const foreignId = foreign.body.id as string;
  this.response = await v2Get(this, 'v2/bank-match-sources').query({ accountId: foreignId }).expect(404);
  const missing = await v2Get(this, 'v2/bank-match-sources').query({ accountId: randomUUID() }).expect(404);
  assert.deepEqual(this.response.body, missing.body); assert.ok(!JSON.stringify(this.response.body).includes(foreignId));
  await request(this.app!.getHttpServer()).get(`${path}/v2/bank-statements`).set('Authorization', `Bearer ${this.financeToken}`).expect(403);
  await request(this.app!.getHttpServer()).get(`${financeRoot(this)}/v2/bank-statements`).set('Authorization', `Bearer ${token}`).expect(403);
});

Then('RB la cuenta ajena no se revela y no hay conciliación ni mezcla de saldos', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(this.response!.status, 404); assert.equal(await this.financePrisma.financeBankMatch.count(), 0);
  const report = await v2Report(this);
  assert.equal(report.accounts.length, 1); assert.equal(report.accounts[0].id, this.v2AccountId); assert.equal(report.totals.registeredBalanceMinor, 0);
});
