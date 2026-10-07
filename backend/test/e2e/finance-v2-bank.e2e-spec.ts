import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceAccount, FinanceReport, FinanceResult } from '../../src/modules/finance/domain/finance.types';
import type { FinanceCorrectionsData, FinancePaymentAdjustmentCommand, FinancePaymentAdjustmentResult } from '../../src/modules/finance/domain/finance-corrections.types';
import type {
  BankMatchComponentInput, ConfirmBankMatchCommand, ConfirmBankStatementCommand, FinanceBankMatchDto,
  FinanceBankMatchPreview, FinanceBankMatchPreviewInput, FinanceBankMatchSourceDto, FinanceBankRowDto,
  FinanceBankStatementDto, FinanceBankStatementPreview, FinanceBankStatementPreviewInput, FinanceV2Page, FinanceV2Result,
} from '../../src/modules/finance/domain/finance-v2.types';
import {
  assertFinanceDatabase, closeFinanceApp, createFinanceApp, financeFixture, financeInstant, financePaymentFixture,
  financePeriod, paymentFingerprint, realFinanceToken, resetFinanceDatabase, type FinanceFixture,
} from '../fixtures/finance-fixture';

const openingMinor = 1000000;
const header = 'externalKey,bookedOn,amountMinor,reference';

function required<T>(value: T | undefined, description: string): T {
  expect(value).toBeDefined();
  if (value === undefined) throw new Error(`Falta ${description} en el contrato HTTP.`);
  return value;
}

function component(source: FinanceBankMatchSourceDto, amountMinor = source.residualMinor): BankMatchComponentInput {
  expect(source.sourceVersion).toBeGreaterThanOrEqual(1);
  expect(source.sourceHash).toMatch(/^[0-9a-f]{64}$/u);
  return { ...source.ref, sourceVersion: source.sourceVersion, sourceHash: source.sourceHash, amountMinor };
}

function selectedRow(row: FinanceBankRowDto, amountMinor = row.residualMinor): ConfirmBankMatchCommand['rows'][number] {
  return { id: row.id, version: row.version, amountMinor };
}

describe('Finance V2 banco HTTP con AppModule, JWT y PostgreSQL reales', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FinanceFixture;
  let ownerToken: string;
  const base = (businessId = fixture.business.id) => `/api/businesses/${businessId}/finance`;
  const endpoint = (businessId = fixture.business.id) => `${base(businessId)}/v2`;
  const post = (path: string, body: object, token = ownerToken, businessId = fixture.business.id) => request(app.getHttpServer()).post(`${endpoint(businessId)}/${path}`).set('Authorization', `Bearer ${token}`).send(body);
  const command = (body: object, key: string = randomUUID(), token = ownerToken, businessId = fixture.business.id) => post('commands', body, token, businessId).set('Idempotency-Key', key);
  const v1 = (body: object, token = ownerToken, businessId = fixture.business.id) => request(app.getHttpServer()).post(`${base(businessId)}/commands`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', randomUUID()).send(body);
  const read = (path: string, token = ownerToken, businessId = fixture.business.id) => request(app.getHttpServer()).get(`${endpoint(businessId)}/${path}`).set('Authorization', `Bearer ${token}`);
  const report = async (token = ownerToken, businessId = fixture.business.id): Promise<FinanceReport> => (await request(app.getHttpServer()).get(base(businessId)).set('Authorization', `Bearer ${token}`).query(financePeriod).expect(200)).body as FinanceReport;
  const statements = async (token = ownerToken, businessId = fixture.business.id): Promise<FinanceV2Page<FinanceBankStatementDto>> => (await read('bank-statements', token, businessId).query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceBankStatementDto>;
  const matches = async (token = ownerToken, businessId = fixture.business.id): Promise<FinanceV2Page<FinanceBankMatchDto>> => (await read('bank-matches', token, businessId).query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceBankMatchDto>;
  const sources = async (accountId: string, token = ownerToken, businessId = fixture.business.id): Promise<FinanceBankMatchSourceDto[]> => (await read('bank-match-sources', token, businessId).query({ accountId }).expect(200)).body as FinanceBankMatchSourceDto[];

  async function bank(token = ownerToken, businessId = fixture.business.id): Promise<FinanceAccount> {
    const result = (await v1({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Banco sintético FIN020', opening: { amountMinor: openingMinor, occurredAt: financeInstant, reason: 'Saldo inicial conocido' } }, token, businessId).expect(200)).body as FinanceResult;
    return required((await report(token, businessId)).accounts.find(account => account.id === result.id), 'cuenta bancaria');
  }

  async function statementInput(accountId: string, csv: string, sourceNamespace = 'bank-qa', token = ownerToken, businessId = fixture.business.id): Promise<FinanceBankStatementPreviewInput> {
    const account = required((await report(token, businessId)).accounts.find(item => item.id === accountId), 'versión de cuenta');
    return { accountId, expectedAccountVersion: account.version, sourceNamespace, csv };
  }

  async function statementPreview(input: FinanceBankStatementPreviewInput, token = ownerToken, businessId = fixture.business.id): Promise<FinanceBankStatementPreview> {
    const result = (await post('bank-preview', input, token, businessId).expect(200)).body as FinanceBankStatementPreview;
    expect(result).toMatchObject({ businessId, accountId: input.accountId, issues: [] });
    expect(result.previewToken).toMatch(/^[0-9a-f]{64}$/u);
    return result;
  }

  async function importRows(accountId: string, amounts: readonly number[], sourceNamespace = 'bank-qa', token = ownerToken, businessId = fixture.business.id): Promise<FinanceBankStatementDto> {
    const csv = [header, ...amounts.map((amount, index) => `row-${index + 1},2026-10-02,${amount},Referencia ${index + 1}`)].join('\n');
    const input = await statementInput(accountId, csv, sourceNamespace, token, businessId);
    const preview = await statementPreview(input, token, businessId);
    const result = (await command({ ...input, type: 'CONFIRM_BANK_STATEMENT', previewToken: preview.previewToken, reason: 'Confirmación manual de extracto' }, randomUUID(), token, businessId).expect(200)).body as FinanceV2Result;
    return required((await statements(token, businessId)).items.find(item => item.id === result.id), 'extracto confirmado');
  }

  async function matchPreview(input: FinanceBankMatchPreviewInput): Promise<FinanceBankMatchPreview> {
    const result = (await post('bank-match-preview', input).expect(200)).body as FinanceBankMatchPreview;
    expect(result).toMatchObject({ businessId: fixture.business.id, accountId: input.accountId, staleReasons: [] });
    expect(result.previewToken).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.rowTotalMinor).toBe(result.componentTotalMinor);
    return result;
  }

  async function confirmMatch(input: FinanceBankMatchPreviewInput, key: string = randomUUID()): Promise<FinanceV2Result> {
    const preview = await matchPreview(input);
    return (await command({ ...input, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken }, key).expect(200)).body as FinanceV2Result;
  }

  function matchInput(accountId: string, rows: FinanceBankRowDto[], components: BankMatchComponentInput[], paymentIds: string[] = []): FinanceBankMatchPreviewInput {
    return { accountId, rows: rows.map(row => selectedRow(row)), components, paymentLinks: paymentIds.map(paymentId => ({ paymentId, accountId, expectedLinkVersion: 0, reason: 'Asignación explícita del cobro al banco' })), fees: [], reason: 'Conciliación manual de evidencia' };
  }

  async function linkedPayment(accountId: string, amountMinor: number) {
    const value = await financePaymentFixture(prisma, fixture.actor, amountMinor);
    await v1({ type: 'LINK_PAYMENT', paymentId: value.payment.id, accountId, expectedVersion: 0, reason: 'Cobro ya registrado en el banco' }).expect(200);
    return value;
  }

  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); await assertFinanceDatabase(prisma); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); ownerToken = await realFinanceToken(app, fixture.users.OWNER.id); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  it('preview CSV y confirmación sólo guardan evidencia; reintentos no duplican filas ni caja', async () => {
    const account = await bank();
    const csv = `${header}\ncredito,2026-10-02,120000,"Referencia, con ""comillas"""\ndebito,2026-10-02,-20000,Comisión externa`;
    const input = await statementInput(account.id, csv);
    const before = await report();
    const preview = await statementPreview(input);
    expect(preview.rows).toEqual([
      { ordinal: 1, externalKey: 'credito', bookedOn: '2026-10-02', amountMinor: 120000, reference: 'Referencia, con "comillas"', existingRowId: null },
      { ordinal: 2, externalKey: 'debito', bookedOn: '2026-10-02', amountMinor: -20000, reference: 'Comisión externa', existingRowId: null },
    ]);
    expect((await statements()).items).toEqual([]);
    expect((await report()).totals).toEqual(before.totals);
    const intent: ConfirmBankStatementCommand = { ...input, type: 'CONFIRM_BANK_STATEMENT', previewToken: required(preview.previewToken ?? undefined, 'token'), reason: 'Extracto cotejado manualmente' };
    const key = randomUUID();
    const first = await command(intent, key).expect(200);
    const retry = await command(intent, key).expect(200);
    expect(retry.body).toEqual(first.body);
    await command({ ...intent, reason: 'Otra intención' }, key).expect(409);
    const fresh = await statementPreview(input);
    expect(fresh.rows.every(row => typeof row.existingRowId === 'string')).toBe(true);
    const duplicate = await command({ ...intent, previewToken: fresh.previewToken }).expect(200);
    expect(duplicate.body.id).toBe(first.body.id);
    const page = await statements();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].rows).toHaveLength(2);
    expect(page.items[0].rows.map(row => row.amountMinor).sort((a, b) => a - b)).toEqual([-20000, 120000]);
    expect(page.items[0].rows.every(row => row.status === 'UNMATCHED' && row.reservedMinor === 0)).toBe(true);
    expect((await report()).totals).toEqual(before.totals);
    expect(await prisma.financeExpense.count()).toBe(0);
    expect(await prisma.financeSettlement.count()).toBe(0);
    expect(await prisma.financeCashMovement.count()).toBe(0);
    expect(await prisma.financePaymentLink.count()).toBe(0);
  });

  it('rechaza CSV inválido, clave externa alterada y versión vieja sin persistir evidencia parcial', async () => {
    const account = await bank();
    const csv = `${header}\nrow-1,2026-10-02,100000,Origen`;
    const input = await statementInput(account.id, csv);
    const preview = await statementPreview(input);
    await command({ ...input, type: 'CONFIRM_BANK_STATEMENT', expectedAccountVersion: input.expectedAccountVersion + 1, previewToken: preview.previewToken, reason: 'Versión inválida' }).expect(409);
    for (const invalid of [`${header}\nx,2026-10-02,0,Cero`, `${header}\nx,2026-02-30,1,Fecha`, `${header}\nx,2026-10-02,1,Uno\nx,2026-10-02,2,Duplicado`, `${header}\nx,2026-10-02,1.2,Decimal`]) {
      await post('bank-preview', { ...input, csv: invalid }).expect(400);
    }
    expect((await statements()).items).toEqual([]);
    await command({ ...input, type: 'CONFIRM_BANK_STATEMENT', previewToken: preview.previewToken, reason: 'Importación correcta' }).expect(200);
    await post('bank-preview', { ...input, csv: csv.replace('100000', '100001') }).expect(400);
    expect((await statements()).items).toHaveLength(1);
    expect((await statements()).items[0].rows[0].amountMinor).toBe(100000);
    expect((await report()).totals.registeredBalanceMinor).toBe(openingMinor);
  });

  it('1 fila a 2 cobros conserva bruto, asigna cuentas explícitamente y reserva cada fuente una vez', async () => {
    const account = await bank();
    const first = await financePaymentFixture(prisma, fixture.actor, 60000);
    const second = await financePaymentFixture(prisma, fixture.actor, 40000);
    const original = await Promise.all([paymentFingerprint(prisma, first.booking.id), paymentFingerprint(prisma, second.booking.id)]);
    const statement = await importRows(account.id, [100000]);
    const available = await sources(account.id);
    const firstSource = required(available.find(source => source.ref.sourceId === first.payment.id), 'primer cobro');
    const secondSource = required(available.find(source => source.ref.sourceId === second.payment.id), 'segundo cobro');
    expect(firstSource).toMatchObject({ amountMinor: 60000, residualMinor: 60000, needsAccountLink: true, accountId: null });
    expect(secondSource).toMatchObject({ amountMinor: 40000, residualMinor: 40000, needsAccountLink: true, accountId: null });
    const input = matchInput(account.id, statement.rows, [component(firstSource), component(secondSource)], [first.payment.id, second.payment.id]);
    await matchPreview(input);
    expect((await matches()).items).toEqual([]);
    expect(await prisma.financePaymentLink.count()).toBe(0);
    expect((await report()).totals.registeredBalanceMinor).toBe(openingMinor);
    const result = await confirmMatch(input);
    const saved = required((await matches()).items.find(item => item.id === result.id), 'conciliación 1:N');
    expect(saved.rows).toEqual([{ bankRowId: statement.rows[0].id, consumedAmountMinor: 100000 }]);
    expect(saved.components.map(source => source.amountMinor).sort((a, b) => a - b)).toEqual([40000, 60000]);
    expect(saved.staleReasons).toEqual([]);
    expect((await sources(account.id)).every(source => source.residualMinor === 0 && source.accountId === account.id && !source.needsAccountLink)).toBe(true);
    expect((await statements()).items[0].rows[0]).toMatchObject({ status: 'MATCHED', reservedMinor: 100000, residualMinor: 0 });
    expect((await report()).totals.registeredBalanceMinor).toBe(1100000);
    expect(await Promise.all([paymentFingerprint(prisma, first.booking.id), paymentFingerprint(prisma, second.booking.id)])).toEqual(original);
  });

  it('2 filas a 1 cobro ya asignado sólo concilian evidencia y conservan saldo1100000', async () => {
    const account = await bank();
    const payment = await linkedPayment(account.id, 100000);
    const statement = await importRows(account.id, [60000, 40000]);
    const source = required((await sources(account.id)).find(item => item.ref.sourceId === payment.payment.id), 'cobro N:1');
    const before = await report();
    const input = matchInput(account.id, statement.rows, [component(source)]);
    const preview = await matchPreview(input);
    expect(preview).toMatchObject({ rowTotalMinor: 100000, componentTotalMinor: 100000 });
    expect(preview.sources[0].residualMinor).toBe(0);
    const result = await confirmMatch(input);
    const saved = required((await matches()).items.find(item => item.id === result.id), 'conciliación N:1');
    expect(saved.rows.map(row => row.consumedAmountMinor).sort((a, b) => a - b)).toEqual([40000, 60000]);
    expect(saved.components).toEqual([component(source)]);
    expect((await statements()).items[0].rows.every(row => row.status === 'MATCHED' && row.residualMinor === 0)).toBe(true);
    expect((await report()).totals).toEqual(before.totals);
    expect((await report()).totals.registeredBalanceMinor).toBe(1100000);
  });

  it('reserva parcial60/100, rechaza preview viejo y sobreconsumo, refresca40/100 y CAS cancelación', async () => {
    const account = await bank();
    const payment = await linkedPayment(account.id, 100000);
    const statement = await importRows(account.id, [100000]);
    const row = statement.rows[0];
    const source = required((await sources(account.id)).find(item => item.ref.sourceId === payment.payment.id), 'cobro parcial');
    const firstInput = { ...matchInput(account.id, [row], [component(source, 60000)]), rows: [selectedRow(row, 60000)] };
    const secondInput = { ...matchInput(account.id, [row], [component(source, 40000)]), rows: [selectedRow(row, 40000)] };
    const oldPreview = await matchPreview(secondInput);
    const first = await confirmMatch(firstInput);
    expect((await statements()).items[0].rows[0]).toMatchObject({ status: 'PARTIAL', reservedMinor: 60000, residualMinor: 40000 });
    expect((await sources(account.id))[0]).toMatchObject({ amountMinor: 100000, residualMinor: 40000 });
    await command({ ...secondInput, type: 'CONFIRM_BANK_MATCH', previewToken: oldPreview.previewToken }).expect(409);
    await post('bank-match-preview', firstInput).expect(400);
    const freshSource = required((await sources(account.id)).find(item => item.ref.sourceId === payment.payment.id), 'residuo de cobro');
    const freshRow = (await statements()).items[0].rows[0];
    const freshInput = { ...matchInput(account.id, [freshRow], [component(freshSource)]), rows: [selectedRow(freshRow)] };
    const freshPreview = await matchPreview(freshInput);
    await command({ ...freshInput, rows: [{ ...freshInput.rows[0], version: freshRow.version + 1 }], type: 'CONFIRM_BANK_MATCH', previewToken: freshPreview.previewToken }).expect(409);
    await command({ ...freshInput, components: [{ ...freshInput.components[0], sourceVersion: freshSource.sourceVersion + 1 }], type: 'CONFIRM_BANK_MATCH', previewToken: freshPreview.previewToken }).expect(409);
    const second = await confirmMatch(freshInput);
    expect((await statements()).items[0].rows[0]).toMatchObject({ status: 'MATCHED', residualMinor: 0 });
    const cancel = { type: 'CANCEL_BANK_MATCH', id: first.id, expectedVersion: first.version, reason: 'Cotejo corregido manualmente' };
    const key = randomUUID();
    const cancelled = await command(cancel, key).expect(200);
    expect(cancelled.body).toMatchObject({ id: first.id, version: first.version + 1, type: 'CANCEL_BANK_MATCH' });
    expect((await command(cancel, key).expect(200)).body).toEqual(cancelled.body);
    await command(cancel).expect(409);
    const page = await matches();
    expect(required(page.items.find(item => item.id === first.id), 'cancelación')).toMatchObject({ state: 'CANCELLED', version: 2, cancelledByUserId: fixture.users.OWNER.id });
    expect(required(page.items.find(item => item.id === second.id), 'reserva restante')).toMatchObject({ state: 'ACTIVE', version: 1 });
    expect((await statements()).items[0].rows[0]).toMatchObject({ status: 'PARTIAL', reservedMinor: 40000, residualMinor: 60000 });
    expect((await sources(account.id))[0].residualMinor).toBe(60000);
    expect((await report()).totals.registeredBalanceMinor).toBe(1100000);
  });

  it('comisión5000 crea gasto y liquidación reales una vez; cancelar y reutilizar conserva caja1095000', async () => {
    const account = await bank();
    const payment = await linkedPayment(account.id, 100000);
    const statement = await importRows(account.id, [95000]);
    const source = required((await sources(account.id)).find(item => item.ref.sourceId === payment.payment.id), 'cobro con comisión');
    const input = matchInput(account.id, statement.rows, [component(source)]);
    input.fees = [{ bankRowId: statement.rows[0].id, expenseDefinition: { description: 'Comisión bancaria sintética', counterpartyId: fixture.counterparty.id, reference: 'COM-01', amountMinor: 5000, lines: [{ label: 'Comisión', categoryId: fixture.category.id, resourceId: null, bookingId: null, amountMinor: 5000, operational: true }] }, consumedOn: '2026-10-02', occurredAt: '2026-10-02T12:00:00.000Z', reference: 'Cargo bancario ya efectuado' }];
    const preview = await matchPreview(input);
    expect(preview).toMatchObject({ rowTotalMinor: 95000, componentTotalMinor: 95000 });
    expect(await prisma.financeExpense.count()).toBe(0);
    expect((await report()).totals.registeredBalanceMinor).toBe(1100000);
    const intent = { ...input, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken };
    const key = randomUUID();
    const first = await command(intent, key).expect(200);
    expect((await command(intent, key).expect(200)).body).toEqual(first.body);
    await command({ ...intent, reason: 'Otra comisión' }, key).expect(409);
    const value = await report();
    expect(value.totals).toMatchObject({ expenseMinor: 5000, settlementsMinor: 5000, outstandingMinor: 0, registeredBalanceMinor: 1095000 });
    expect(value.expenses).toHaveLength(1);
    const expense = value.expenses[0];
    expect(expense).toMatchObject({ amountMinor: 5000, paidAmountMinor: 5000, outstandingMinor: 0, reference: 'COM-01' });
    expect(expense.settlements).toHaveLength(1);
    expect(expense.settlements[0]).toMatchObject({ accountId: account.id, amountMinor: 5000, reference: 'Cargo bancario ya efectuado' });
    const saved = required((await matches()).items.find(item => item.id === first.body.id), 'comisión conciliada');
    expect(saved.components.map(item => item.amountMinor).sort((a, b) => a - b)).toEqual([-5000, 100000]);
    expect(await prisma.financeExpense.count()).toBe(1);
    expect(await prisma.financeSettlement.count()).toBe(1);
    await command({ type: 'CANCEL_BANK_MATCH', id: first.body.id, expectedVersion: first.body.version, reason: 'Corregir evidencia conservando el pago' }).expect(200);
    expect((await report()).totals).toEqual(value.totals);
    const refreshed = await sources(account.id);
    const paymentSource = required(refreshed.find(item => item.ref.sourceId === payment.payment.id), 'cobro liberado');
    const feeSource = required(refreshed.find(item => item.ref.sourceId === expense.settlements[0].id), 'liquidación de comisión');
    const replacement = matchInput(account.id, (await statements()).items[0].rows, [component(paymentSource), component(feeSource)]);
    replacement.fees = [{ bankRowId: statement.rows[0].id, existingExpenseId: expense.id, existingSettlementId: expense.settlements[0].id }];
    await confirmMatch(replacement);
    expect((await report()).totals).toEqual(value.totals);
    expect(await prisma.financeExpense.count()).toBe(1);
    expect(await prisma.financeSettlement.count()).toBe(1);
  });

  it('devolución100000 y cobro bruto400000 concilian neto300000 sin reescribir ni duplicar caja', async () => {
    const account = await bank();
    const payment = await linkedPayment(account.id, 400000);
    const corrections = (await request(app.getHttpServer()).get(`${base()}/corrections`).set('Authorization', `Bearer ${ownerToken}`).expect(200)).body as FinanceCorrectionsData;
    const booking = required(corrections.bookings.find(item => item.bookingId === payment.booking.id), 'concurrencia de reserva');
    const receipt = required(booking.payments.find(item => item.id === payment.payment.id), 'concurrencia de cobro');
    const currentAccount = required((await report()).accounts.find(item => item.id === account.id), 'concurrencia de banco');
    const adjustment: FinancePaymentAdjustmentCommand = { type: 'REFUND_PAYMENT', bookingId: booking.bookingId, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, paymentId: receipt.id, expectedPaymentVersion: receipt.paymentVersion, amountMinor: 100000, occurredAt: '2026-10-02T12:00:00.000Z', accountId: account.id, expectedAccountVersion: currentAccount.version, reference: 'Devolución externa sintética', reason: 'Devolución parcial ya realizada' };
    const refund = (await request(app.getHttpServer()).post(`${base()}/payment-adjustments`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', randomUUID()).send(adjustment).expect(200)).body as FinancePaymentAdjustmentResult;
    const original = await paymentFingerprint(prisma, payment.booking.id);
    const before = await report();
    expect(before.totals).toMatchObject({ grossRecordedAmountMinor: 400000, refundedAmountMinor: 100000, registeredBalanceMinor: 1300000 });
    const statement = await importRows(account.id, [300000]);
    const available = await sources(account.id);
    const gross = required(available.find(item => item.ref.sourceType === 'PAYMENT' && item.ref.sourceId === payment.payment.id), 'bruto de cobro');
    const outflow = required(available.find(item => item.ref.sourceType === 'REFUND' && item.ref.sourceId === refund.id), 'fuente de devolución');
    expect(gross).toMatchObject({ amountMinor: 400000, residualMinor: 400000, accountId: account.id });
    expect(outflow).toMatchObject({ amountMinor: -100000, residualMinor: -100000, accountId: account.id });
    const input = matchInput(account.id, statement.rows, [component(gross), component(outflow)]);
    const result = await confirmMatch(input);
    const saved = required((await matches()).items.find(item => item.id === result.id), 'neto con devolución');
    expect(saved.components.map(item => item.amountMinor).sort((a, b) => a - b)).toEqual([-100000, 400000]);
    expect(saved.rows[0].consumedAmountMinor).toBe(300000);
    expect((await sources(account.id)).every(item => item.residualMinor === 0)).toBe(true);
    expect((await report()).totals).toEqual(before.totals);
    expect(await paymentFingerprint(prisma, payment.booking.id)).toBe(original);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.payment.id } })).amountMinor).toBe(400000n);
    expect(await prisma.paymentAdjustment.count()).toBe(1);
    expect(await prisma.financeCashMovement.count()).toBe(0);
  });

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const)('%s no puede previsualizar, confirmar, cancelar ni leer evidencia bancaria OWNER', async role => {
    const account = await bank();
    const token = await realFinanceToken(app, fixture.users[role].id);
    const input = await statementInput(account.id, `${header}\nx,2026-10-02,100000,Evidencia`);
    const preview = await statementPreview(input);
    await post('bank-preview', input, token).expect(403);
    await command({ ...input, type: 'CONFIRM_BANK_STATEMENT', previewToken: preview.previewToken, reason: 'Intento denegado' }, randomUUID(), token).expect(403);
    await post('bank-match-preview', { accountId: account.id, rows: [], components: [], paymentLinks: [], fees: [], reason: 'Intento denegado' }, token).expect(403);
    await command({ type: 'CONFIRM_BANK_MATCH', accountId: account.id, rows: [], components: [], paymentLinks: [], fees: [], reason: 'Intento denegado', previewToken: preview.previewToken }, randomUUID(), token).expect(403);
    await command({ type: 'CANCEL_BANK_MATCH', id: randomUUID(), expectedVersion: 1, reason: 'Intento denegado' }, randomUUID(), token).expect(403);
    for (const path of ['bank-statements', 'bank-matches']) await read(path, token).query({ limit: 10 }).expect(403);
    await read('bank-match-sources', token).query({ accountId: account.id }).expect(403);
    expect((await statements()).items).toEqual([]);
    expect((await matches()).items).toEqual([]);
    expect((await report()).totals.registeredBalanceMinor).toBe(openingMinor);
  });

  it('JWT ausente deniega preview, lectura y confirmación sin crear evidencia', async () => {
    const account = await bank();
    const input = await statementInput(account.id, `${header}\nx,2026-10-02,100000,Evidencia`);
    await request(app.getHttpServer()).post(`${endpoint()}/bank-preview`).send(input).expect(401);
    await request(app.getHttpServer()).get(`${endpoint()}/bank-statements`).expect(401);
    await request(app.getHttpServer()).get(`${endpoint()}/bank-match-sources`).query({ accountId: account.id }).expect(401);
    await request(app.getHttpServer()).post(`${endpoint()}/commands`).set('Idempotency-Key', randomUUID()).send({ ...input, type: 'CONFIRM_BANK_STATEMENT', previewToken: 'token-sin-autenticacion', reason: 'Intento anónimo' }).expect(401);
    expect((await statements()).items).toEqual([]);
    expect((await report()).totals.registeredBalanceMinor).toBe(openingMinor);
  });

  it('dos tenants aíslan cuentas, extractos, filas y hashes; URL y referencias ajenas no mutan', async () => {
    const account = await bank();
    const foreignToken = await realFinanceToken(app, fixture.foreignOwner.id);
    const foreignAccount = await bank(foreignToken, fixture.foreignBusiness.id);
    const ownStatement = await importRows(account.id, [100000]);
    const foreignStatement = await importRows(foreignAccount.id, [100000], 'bank-qa', foreignToken, fixture.foreignBusiness.id);
    const ownPayment = await linkedPayment(account.id, 100000);
    const foreignPayment = await financePaymentFixture(prisma, fixture.foreignActor, 100000);
    await v1({ type: 'LINK_PAYMENT', paymentId: foreignPayment.payment.id, accountId: foreignAccount.id, expectedVersion: 0, reason: 'Asignación de tenant ajeno' }, foreignToken, fixture.foreignBusiness.id).expect(200);
    const ownSource = required((await sources(account.id)).find(item => item.ref.sourceId === ownPayment.payment.id), 'fuente propia');
    const foreignSource = required((await sources(foreignAccount.id, foreignToken, fixture.foreignBusiness.id)).find(item => item.ref.sourceId === foreignPayment.payment.id), 'fuente ajena');
    expect((await statements()).items.map(item => item.id)).toEqual([ownStatement.id]);
    expect((await statements(foreignToken, fixture.foreignBusiness.id)).items.map(item => item.id)).toEqual([foreignStatement.id]);
    expect((await sources(account.id)).map(item => item.ref.sourceId)).toEqual([ownPayment.payment.id]);
    await read('bank-statements', ownerToken, fixture.foreignBusiness.id).expect(403);
    await read('bank-statements', foreignToken).expect(403);
    const foreignAccountResponse = await read('bank-match-sources').query({ accountId: foreignAccount.id }).expect(404);
    const absentAccountResponse = await read('bank-match-sources').query({ accountId: randomUUID() }).expect(404);
    expect(foreignAccountResponse.body).toEqual(absentAccountResponse.body);
    const input = matchInput(account.id, ownStatement.rows, [component(ownSource)]);
    const preview = await matchPreview(input);
    const foreignComponent = { ...input, components: [component(foreignSource)] };
    const foreignRow = { ...input, rows: foreignStatement.rows.map(row => selectedRow(row)) };
    await post('bank-match-preview', foreignComponent).expect(400);
    await post('bank-match-preview', foreignRow).expect(400);
    await command({ ...foreignComponent, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken }).expect(409);
    await command({ ...foreignRow, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken }).expect(409);
    expect((await matches()).items).toEqual([]);
    expect((await matches(foreignToken, fixture.foreignBusiness.id)).items).toEqual([]);
    expect((await statements()).items[0].rows[0].reservedMinor).toBe(0);
    expect((await statements(foreignToken, fixture.foreignBusiness.id)).items[0].rows[0].reservedMinor).toBe(0);
    expect((await report()).totals.registeredBalanceMinor).toBe(1100000);
    expect((await report(foreignToken, fixture.foreignBusiness.id)).totals.registeredBalanceMinor).toBe(1100000);
  });

  it('retry concurrente de conciliación confirma una sola reserva y mantiene sourceHash literal', async () => {
    const account = await bank();
    const payment = await linkedPayment(account.id, 100000);
    const statement = await importRows(account.id, [100000]);
    const source = required((await sources(account.id)).find(item => item.ref.sourceId === payment.payment.id), 'fuente concurrente');
    const input = matchInput(account.id, statement.rows, [component(source)]);
    const preview = await matchPreview(input);
    const intent = { ...input, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken };
    const key = randomUUID();
    const responses = await Promise.all([command(intent, key).expect(200), command(intent, key).expect(200)]);
    expect(responses[0].body).toEqual(responses[1].body);
    const page = await matches();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].components).toEqual([component(source)]);
    expect((await sources(account.id))[0]).toMatchObject({ sourceHash: source.sourceHash, sourceVersion: source.sourceVersion, amountMinor: 100000, residualMinor: 0 });
    expect((await statements()).items[0].rows[0]).toMatchObject({ reservedMinor: 100000, residualMinor: 0 });
    await command({ ...intent, reason: 'Otra intención concurrente' }, key).expect(409);
    await command(intent).expect(409);
    expect((await matches()).items).toHaveLength(1);
    expect((await report()).totals.registeredBalanceMinor).toBe(1100000);
  });
});
