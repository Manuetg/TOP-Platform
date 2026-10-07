import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Given, Then, When } from '@cucumber/cucumber';
import request from 'supertest';
import type { BookingAmendmentPreview } from '../../../src/modules/booking-lifecycle/booking-amendment.contract';
import type { FinancePaymentAdjustmentCommand } from '../../../src/modules/finance/domain/finance-corrections.types';
import type { FinanceHistoryPreview } from '../../../src/modules/finance/domain/finance-v2.types';
import { HISTORY_CSV_HEADER } from '../../../src/modules/finance/application/finance-v2-import.parser';
import { paymentFingerprint } from '../../fixtures/finance-fixture';
import { createV2Bank, historyCsvRow, originalPaymentFacts, paidBooking, selectedCorrection, v2Command, v2Post, v2Report, type FinanceV2AcceptanceWorld } from './finance-v2-acceptance.helper';

Given('HIS el OWNER dispone de dos negocios sintéticos aislados', function (this: FinanceV2AcceptanceWorld) {
  assert.ok(this.app); assert.ok(this.financePrisma);
  assert.notEqual(this.financeFixture.business.id, this.financeFixture.foreignBusiness.id);
  assert.equal(this.financeToken.split('.').length, 3);
});

Given('HIS el precio es {int} y registra un cobro de {int} por HTTP', { timeout: 20000 }, async function (this: FinanceV2AcceptanceWorld, price: number, paid: number) {
  const value = await paidBooking(this, price, paid);
  this.v2BookingId = value.bookingId; this.v2PaymentId = value.paymentId;
  this.v2OriginalFacts = await originalPaymentFacts(this);
  const applications = await this.financePrisma.paymentApplication.findMany({ where: { paymentId: value.paymentId } });
  assert.equal(applications.length, 1); assert.equal(applications[0].amountMinor, BigInt(paid));
});

Given('HIS existe un cobro original de {int} y una cuenta sin apertura', { timeout: 20000 }, async function (this: FinanceV2AcceptanceWorld, amount: number) {
  const value = await paidBooking(this, 1000000, amount);
  this.v2BookingId = value.bookingId; this.v2PaymentId = value.paymentId;
  this.v2AccountId = await createV2Bank(this, null);
  this.v2LegacyFingerprint = await paymentFingerprint(this.financePrisma, value.bookingId);
});

When('HIS previsualiza una apertura fraccionaria y una fila de tipo inválido', async function (this: FinanceV2AcceptanceWorld) {
  const csv = [HISTORY_CSV_HEADER.join(','), historyCsvRow({ rowKind: 'OPENING', rowKey: 'decimal', accountId: this.v2AccountId, amountMinor: '450000.5', occurredAt: '2026-10-01T00:00:00Z', reason: 'Fracción inválida' }), historyCsvRow({ rowKind: 'UNKNOWN', rowKey: 'tipo-invalido' })].join('\n');
  const before = await this.financePrisma.financeRequest.count();
  this.response = await v2Post(this, 'v2/history-preview', { sourceNamespace: 'history-acceptance', csv }).expect(400);
  assert.equal(await this.financePrisma.financeRequest.count(), before);
});

Then('HIS recibe errores de filas 2 y 3 sin token de confirmación', function (this: FinanceV2AcceptanceWorld) {
  const result = this.response!.body as { previewToken: null; issues: { ordinal: number; column: string; code: string }[] };
  assert.equal(result.previewToken, null);
  assert.deepEqual(result.issues.map(issue => ({ ordinal: issue.ordinal, column: issue.column, code: issue.code })), [
    { ordinal: 2, column: 'amountMinor', code: 'INVALID_INPUT' }, { ordinal: 3, column: 'rowKind', code: 'INVALID_INPUT' },
  ]);
});

Then('HIS no hay lote gasto apertura ni liquidación importados y el legado permanece íntegro', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(await this.financePrisma.financeImportBatch.count(), 0);
  assert.equal(await this.financePrisma.financeExpense.count(), 0);
  assert.equal(await this.financePrisma.financeOpening.count(), 0);
  assert.equal(await this.financePrisma.financeSettlement.count(), 0);
  assert.equal(await paymentFingerprint(this.financePrisma, this.v2BookingId), this.v2LegacyFingerprint);
});

When('HIS previsualiza apertura de 1000000 gasto de 900000 y pago previo de 300000 incluido en apertura', async function (this: FinanceV2AcceptanceWorld) {
  this.v2SourceNamespace = 'history-acceptance';
  this.v2Csv = [HISTORY_CSV_HEADER.join(','),
    historyCsvRow({ rowKind: 'OPENING', rowKey: 'opening-1', accountId: this.v2AccountId, amountMinor: '1000000', occurredAt: '2026-10-01T00:00:00Z', reason: 'Apertura propia documentada' }),
    historyCsvRow({ rowKind: 'EXPENSE_LINE', rowKey: 'line-1', documentKey: 'expense-1', description: 'Consumo histórico', consumedOn: '2026-09-20', documentAmountMinor: '900000', lineOrdinal: '1', label: 'Costo', categoryId: this.financeFixture.category.id, lineAmountMinor: '900000', operational: 'true' }),
    historyCsvRow({ rowKind: 'SETTLEMENT', rowKey: 'settlement-1', accountId: this.v2AccountId, expenseDocumentKey: 'expense-1', amountMinor: '300000', occurredAt: '2026-09-25T12:00:00Z', includedInOpening: 'true' }),
  ].join('\n');
  this.response = await v2Post(this, 'v2/history-preview', { sourceNamespace: this.v2SourceNamespace, csv: this.v2Csv }).expect(200);
  const preview = this.response.body as FinanceHistoryPreview;
  assert.ok(preview.previewToken); this.v2PreviewToken = preview.previewToken;
});

Then('HIS la vista previa no escribe y declara gasto 900000 pago 300000 y exclusión 300000', async function (this: FinanceV2AcceptanceWorld) {
  const preview = this.response!.body as FinanceHistoryPreview;
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.totals.expenseMinor, 900000); assert.equal(preview.totals.settlementMinor, 300000); assert.equal(preview.totals.excludedCashMinor, 300000);
  assert.equal(await this.financePrisma.financeImportBatch.count(), 0); assert.equal(await this.financePrisma.financeExpense.count(), 0);
});

When('HIS confirma el lote y repite la misma intención y el mismo archivo', { timeout: 20000 }, async function (this: FinanceV2AcceptanceWorld) {
  const command = { type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: this.v2SourceNamespace, csv: this.v2Csv, previewToken: this.v2PreviewToken, reason: 'OWNER coteja las fuentes históricas.' };
  const key = randomUUID(), first = await v2Command(this, command, key).expect(200);
  assert.deepEqual((await v2Command(this, command, key).expect(200)).body, first.body);
  const fresh = (await v2Post(this, 'v2/history-preview', { sourceNamespace: this.v2SourceNamespace, csv: this.v2Csv }).expect(200)).body as FinanceHistoryPreview;
  assert.ok(fresh.sources.every(source => source.status === 'ALREADY_IMPORTED')); assert.ok(fresh.previewToken);
  await v2Command(this, { ...command, previewToken: fresh.previewToken }).expect(200);
  assert.equal(await this.financePrisma.financeImportBatch.count(), 1); assert.equal(await this.financePrisma.financeImportItem.count(), 3);
  assert.equal(await this.financePrisma.financeExpense.count(), 1); assert.equal(await this.financePrisma.financeSettlement.count(), 1);
});

Then('HIS conserva un gasto de 900000 deuda 600000 y banco 1000000', async function (this: FinanceV2AcceptanceWorld) {
  const report = await v2Report(this);
  assert.equal(report.totals.operatingCostMinor, 900000); assert.equal(report.totals.outstandingMinor, 600000);
  assert.equal(report.accounts.find(account => account.id === this.v2AccountId)?.balanceMinor, 1000000);
  assert.equal(report.totals.unassignedPaymentsMinor, 100000);
});

Then('HIS los hechos originales de reserva precio cobro y aplicaciones permanecen íntegros', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(await paymentFingerprint(this.financePrisma, this.v2BookingId), this.v2LegacyFingerprint);
});

When('HIS anula ese registro con una intención repetida', async function (this: FinanceV2AcceptanceWorld) {
  const booking = await selectedCorrection(this), receipt = booking.payments.find(payment => payment.id === this.v2PaymentId)!;
  const command: FinancePaymentAdjustmentCommand = { type: 'VOID_PAYMENT', bookingId: booking.bookingId, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, paymentId: receipt.id, expectedPaymentVersion: receipt.paymentVersion, reason: 'Registro erróneo confirmado manualmente.' };
  const key = randomUUID(), first = await v2Post(this, 'payment-adjustments', command, key).expect(200);
  assert.deepEqual((await v2Post(this, 'payment-adjustments', command, key).expect(200)).body, first.body);
  await v2Post(this, 'payment-adjustments', command).expect(409);
});

Then('HIS el bruto es 100000 el anulado 100000 el neto 0 y la deuda 100000', async function (this: FinanceV2AcceptanceWorld) {
  const value = await selectedCorrection(this);
  assert.deepEqual(value.amounts, { grossRecordedAmountMinor: 100000, voidedAmountMinor: 100000, refundedAmountMinor: 0, netRetainedAmountMinor: 0 });
  assert.equal(value.outstandingMinor, 100000); assert.equal(value.creditMinor, 0); assert.equal(value.status, 'CONFIRMED');
});

Then('HIS hay un reverso de aplicación de 100000 y los hechos originales permanecen íntegros', async function (this: FinanceV2AcceptanceWorld) {
  const reversals = await this.financePrisma.paymentApplicationReversal.findMany({ where: { paymentId: this.v2PaymentId } });
  assert.equal(reversals.length, 1); assert.equal(reversals[0].amountMinor, 100000n);
  assert.equal(await this.financePrisma.paymentAdjustment.count(), 1);
  assert.equal(await originalPaymentFacts(this), this.v2OriginalFacts);
});

Given('HIS asigna el cobro a banco con apertura {int}', async function (this: FinanceV2AcceptanceWorld, opening: number) {
  this.v2AccountId = await createV2Bank(this, opening);
  await v2Post(this, 'commands', { type: 'LINK_PAYMENT', paymentId: this.v2PaymentId, accountId: this.v2AccountId, expectedVersion: 0, reason: 'Cuenta real explícita del cobro original.' }).expect(200);
});

When('HIS acepta por HTTP una revisión del precio a {int}', async function (this: FinanceV2AcceptanceWorld, finalAmount: number) {
  const changes = { pricing: [{ resourceId: this.financeFixture.resource.id, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: finalAmount, overrideReason: 'Rebaja acordada del precio.' }], reason: 'Importe comercial revisado por OWNER.' };
  const path = `/api/businesses/${this.financeFixture.business.id}/bookings/${this.v2BookingId}`;
  const preview = (await request(this.app!.getHttpServer()).post(`${path}/amendment-preview`).set('Authorization', `Bearer ${this.financeToken}`).send(changes).expect(200)).body as BookingAmendmentPreview;
  await request(this.app!.getHttpServer()).patch(`${path}/amendment`).set('Authorization', `Bearer ${this.financeToken}`).send({ ...changes, expectedUpdatedAt: preview.expectedUpdatedAt, currentPricingId: preview.currentPricingId, expectedPaidAmountMinor: preview.expectedPaidAmountMinor, expectedFinancialVersion: preview.expectedFinancialVersion, acceptedQuote: preview.quote }).expect(200);
});

Then('HIS el crédito actual es 200000 y el cobro original continúa intacto', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal((await selectedCorrection(this)).creditMinor, 200000);
  assert.equal(await originalPaymentFacts(this), this.v2OriginalFacts);
});

When('HIS registra devolución externa de {int} con una intención repetida', async function (this: FinanceV2AcceptanceWorld, amountMinor: number) {
  const booking = await selectedCorrection(this), receipt = booking.payments.find(payment => payment.id === this.v2PaymentId)!;
  const account = (await v2Report(this)).accounts.find(item => item.id === this.v2AccountId)!;
  const command: FinancePaymentAdjustmentCommand = { type: 'REFUND_PAYMENT', bookingId: booking.bookingId, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, paymentId: receipt.id, expectedPaymentVersion: receipt.paymentVersion, amountMinor, occurredAt: '2026-10-02T12:00:00Z', accountId: account.id, expectedAccountVersion: account.version, reference: 'Devolución ya realizada fuera de TOP.', reason: 'OWNER registra el hecho externo contra su cobro original.' };
  const key = randomUUID(), first = await v2Post(this, 'payment-adjustments', command, key).expect(200);
  assert.deepEqual((await v2Post(this, 'payment-adjustments', command, key).expect(200)).body, first.body);
  await v2Post(this, 'payment-adjustments', { ...command, amountMinor: amountMinor + 1 }, key).expect(409);
});

Then('HIS el neto retenido es {int} el crédito es {int} la deuda es {int} y banco es {int}', async function (this: FinanceV2AcceptanceWorld, net: number, credit: number, debt: number, cash: number) {
  const booking = await selectedCorrection(this), report = await v2Report(this);
  assert.equal(booking.amounts.netRetainedAmountMinor, net); assert.equal(booking.creditMinor, credit); assert.equal(booking.outstandingMinor, debt);
  assert.equal(report.accounts.find(account => account.id === this.v2AccountId)?.balanceMinor, cash);
  const balance = await request(this.app!.getHttpServer()).get(`/api/businesses/${this.financeFixture.business.id}/bookings/${this.v2BookingId}/outstanding-balance`).set('Authorization', `Bearer ${this.financeToken}`).expect(200);
  assert.equal(balance.body.outstandingAmountMinor, debt); assert.equal(balance.body.creditAmountMinor, credit); assert.equal(balance.body.netRetainedAmountMinor, net);
});

Then('HIS existe una devolución sin gasto transferencia ni nuevo cobro', async function (this: FinanceV2AcceptanceWorld) {
  assert.equal(await this.financePrisma.payment.count(), 1); assert.equal(await this.financePrisma.paymentAdjustment.count({ where: { kind: 'REFUND' } }), 1);
  assert.equal(await this.financePrisma.financeExpense.count(), 0); assert.equal(await this.financePrisma.financeTransfer.count(), 0); assert.equal(await this.financePrisma.financeCashMovement.count(), 0);
  assert.equal(await originalPaymentFacts(this), this.v2OriginalFacts);
  assert.equal((await v2Report(this)).totals.operatingCostMinor, 0);
});

When('HIS cancela la reserva por HTTP', async function (this: FinanceV2AcceptanceWorld) {
  await request(this.app!.getHttpServer()).post(`/api/businesses/${this.financeFixture.business.id}/bookings/${this.v2BookingId}/cancel`).set('Authorization', `Bearer ${this.financeToken}`).send({ reason: 'Cancelación solicitada por el huésped sintético.' }).expect(200);
});

Then('HIS cancelar conserva exigible 1000000 deuda 600000 y no crea devolución ni penalidad', async function (this: FinanceV2AcceptanceWorld) {
  const booking = await selectedCorrection(this);
  assert.equal(booking.status, 'CANCELLED'); assert.equal(booking.pricing.totalAmountMinor, 1000000); assert.equal(booking.outstandingMinor, 600000);
  assert.equal(await this.financePrisma.paymentAdjustment.count(), 0); assert.equal(await this.financePrisma.pricingRevision.count(), 0); assert.equal(await this.financePrisma.financeTerminalRecognition.count(), 0);
});

When('HIS confirma manualmente importe final de {int}', async function (this: FinanceV2AcceptanceWorld, finalAmountMinor: number) {
  const booking = await selectedCorrection(this);
  await v2Post(this, 'terminal-pricing', { type: 'SET_TERMINAL_FINAL_AMOUNT', bookingId: booking.bookingId, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, finalAmountMinor, reason: 'Importe final acordado manualmente sin penalidad automática.' }).expect(200);
  const after = await selectedCorrection(this);
  assert.equal(after.pricing.kind, 'TERMINAL_FINAL_AMOUNT'); assert.equal(after.pricing.totalAmountMinor, finalAmountMinor);
  assert.equal(await this.financePrisma.financeTerminalRecognition.count(), 0);
});
