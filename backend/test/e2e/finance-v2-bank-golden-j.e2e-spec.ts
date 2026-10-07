import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceCorrectionsData, FinancePaymentAdjustmentCommand } from '../../src/modules/finance/domain/finance-corrections.types';
import type { BankMatchComponentInput, FinanceBankMatchDto, FinanceBankMatchPreview, FinanceBankMatchPreviewInput, FinanceBankMatchSourceDto, FinanceBankStatementDto, FinanceBankStatementPreview, FinanceBankStatementPreviewInput, FinanceV2Page, FinanceV2Result } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp, createFinanceApp, financeFixture, financeInstant, financePaymentFixture, paymentFingerprint, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';
import { expectSafeRejection, FinanceGoldensQa, requiredGolden } from '../integration/support/finance-goldens.qa';

const GOLDEN_GROSS = 1000000, GOLDEN_REFUND = 100000, GOLDEN_FEE = 150000, GOLDEN_DEPOSIT = 750000, OPENING = 1000000;
type Original = Awaited<ReturnType<typeof financePaymentFixture>>;
type Golden = { accountId: string; originals: Original[]; fingerprints: string[]; refundId: string; statement: FinanceBankStatementDto; statementInput: FinanceBankStatementPreviewInput; statementIntent: object; statementKey: string; matchInput: FinanceBankMatchPreviewInput };

describe('FIN020 Golden J: five originals plus actual refund and one fee reconcile one deposit through real AppModule/JWT/PostgreSQL', () => {
  let app: INestApplication, prisma: PrismaService, fixture: FinanceFixture, qa: FinanceGoldensQa;
  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); qa = new FinanceGoldensQa(app, prisma, fixture, await realFinanceToken(app, fixture.actor.actorUserId)); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });
  const component = (source: FinanceBankMatchSourceDto): BankMatchComponentInput => ({ ...source.ref, sourceVersion: source.sourceVersion, sourceHash: source.sourceHash, amountMinor: source.residualMinor });
  const sources = async (accountId: string, token = qa.ownerToken, businessId = fixture.business.id): Promise<FinanceBankMatchSourceDto[]> => (await qa.get('bank-match-sources', token, businessId).query({ accountId }).expect(200)).body as FinanceBankMatchSourceDto[];
  const statements = async (token = qa.ownerToken, businessId = fixture.business.id): Promise<FinanceV2Page<FinanceBankStatementDto>> => (await qa.get('bank-statements', token, businessId).query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceBankStatementDto>;
  async function bank(token = qa.ownerToken, businessId = fixture.business.id): Promise<string> {
    return ((await qa.v1({ type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Own Golden J bank', opening: { amountMinor: OPENING, occurredAt: financeInstant, reason: 'Explicit initial synthetic balance.' } }, token, businessId).expect(200)).body as FinanceV2Result).id;
  }
  async function importStatement(accountId: string, amountMinor: number, token = qa.ownerToken, businessId = fixture.business.id) {
    const account = requiredGolden((await qa.report(token, businessId)).accounts.find(row => row.id === accountId));
    const input: FinanceBankStatementPreviewInput = { accountId, expectedAccountVersion: account.version, sourceNamespace: 'own-golden-j', csv: `externalKey,bookedOn,amountMinor,reference\ngolden-j-net,2026-10-02,${amountMinor},Five originals net deposit` };
    const preview = (await qa.post('bank-preview', input, token, businessId).expect(200)).body as FinanceBankStatementPreview;
    expect(preview.issues).toEqual([]);
    const intent = { ...input, type: 'CONFIRM_BANK_STATEMENT', previewToken: requiredGolden(preview.previewToken ?? undefined), reason: 'Manual import of own bank evidence.' }, key = randomUUID();
    const result = (await qa.command(intent, key, token, businessId).expect(200)).body as FinanceV2Result;
    const statement = requiredGolden((await statements(token, businessId)).items.find(row => row.id === result.id));
    return { statement, input, intent, key };
  }
  async function golden(): Promise<Golden> {
    const accountId = await bank(), originals: Original[] = [], fingerprints: string[] = [];
    for (let index = 0; index < 5; index++) {
      const original = await financePaymentFixture(prisma, fixture.actor, 200000); originals.push(original);
      fingerprints.push(await paymentFingerprint(prisma, original.booking.id));
      await qa.v1({ type: 'LINK_PAYMENT', paymentId: original.payment.id, accountId, expectedVersion: 0, reason: 'Explicit original bank assignment.' }).expect(200);
    }
    expect((await qa.report()).totals).toMatchObject({ grossRecordedAmountMinor: GOLDEN_GROSS, registeredBalanceMinor: OPENING + GOLDEN_GROSS });
    const corrections = (await request(app.getHttpServer()).get(`${qa.base()}/corrections`).set('Authorization', `Bearer ${qa.ownerToken}`).expect(200)).body as FinanceCorrectionsData;
    const booking = requiredGolden(corrections.bookings.find(row => row.bookingId === originals[0].booking.id)), payment = requiredGolden(booking.payments.find(row => row.id === originals[0].payment.id));
    const account = requiredGolden((await qa.report()).accounts.find(row => row.id === accountId));
    const refund: FinancePaymentAdjustmentCommand = { type: 'REFUND_PAYMENT', bookingId: booking.bookingId, paymentId: payment.id, expectedBookingUpdatedAt: booking.bookingUpdatedAt, currentPricingId: booking.pricing.currentPricingId, expectedFinancialVersion: booking.financialVersion, expectedPaymentVersion: payment.paymentVersion, amountMinor: GOLDEN_REFUND, occurredAt: '2026-10-02T12:00:00.000Z', accountId, expectedAccountVersion: account.version, reference: 'Original external refund proof.', reason: 'Record external refund once.' };
    const refundResult = await request(app.getHttpServer()).post(`${qa.base()}/payment-adjustments`).set('Authorization', `Bearer ${qa.ownerToken}`).set('Idempotency-Key', randomUUID()).send(refund).expect(200);
    const imported = await importStatement(accountId, GOLDEN_DEPOSIT), available = await sources(accountId);
    const selected = [...originals.map(original => requiredGolden(available.find(row => row.ref.sourceType === 'PAYMENT' && row.ref.sourceId === original.payment.id))), requiredGolden(available.find(row => row.ref.sourceType === 'REFUND' && row.ref.sourceId === refundResult.body.id))];
    expect(selected.map(row => row.amountMinor).sort((a, b) => a - b)).toEqual([-100000, 200000, 200000, 200000, 200000, 200000]);
    const row = imported.statement.rows[0];
    const matchInput: FinanceBankMatchPreviewInput = { accountId, rows: [{ id: row.id, version: row.version, amountMinor: GOLDEN_DEPOSIT }], components: selected.map(component), paymentLinks: [], fees: [{ bankRowId: row.id, expenseDefinition: { description: 'One actual Golden J commission', counterpartyId: fixture.counterparty.id, reference: 'J-COMMISSION', amountMinor: GOLDEN_FEE, lines: [{ label: 'Actual commission', categoryId: fixture.category.id, resourceId: null, bookingId: null, amountMinor: GOLDEN_FEE, operational: true }] }, consumedOn: '2026-10-02', occurredAt: '2026-10-02T12:00:00.000Z', reference: 'External commission already deducted.' }], reason: 'Manual five-originals/fee/refund net match.' };
    return { accountId, originals, fingerprints, refundId: refundResult.body.id as string, statement: imported.statement, statementInput: imported.input, statementIntent: imported.intent, statementKey: imported.key, matchInput };
  }

  it('1M gross−100k refund−150k fee=750k single deposit; match/retry/reimport consume every source once, cash1.75M, immutable originals and fee1', async () => {
    const data = await golden(), before = await qa.facts(), preview = (await qa.post('bank-match-preview', data.matchInput).expect(200)).body as FinanceBankMatchPreview;
    expect(preview).toMatchObject({ rowTotalMinor: GOLDEN_DEPOSIT, componentTotalMinor: GOLDEN_DEPOSIT, staleReasons: [] }); expect(await qa.facts()).toEqual(before);
    const body = { ...data.matchInput, type: 'CONFIRM_BANK_MATCH', previewToken: requiredGolden(preview.previewToken ?? undefined) }, key = randomUUID();
    const first = (await qa.command(body, key).expect(200)).body as FinanceV2Result;
    expect((await qa.command(body, key).expect(200)).body).toEqual(first); await qa.expectOneV2Origin('CONFIRM_BANK_MATCH', first, key);
    const report = await qa.report();
    expect(report.totals).toMatchObject({ grossRecordedAmountMinor: GOLDEN_GROSS, refundedAmountMinor: GOLDEN_REFUND, paymentNetRetainedAmountMinor: 900000, expenseMinor: GOLDEN_FEE, operatingCostMinor: GOLDEN_FEE, settlementsMinor: GOLDEN_FEE, outstandingMinor: 0, registeredBalanceMinor: 1750000 });
    expect(report.expenses).toHaveLength(1); expect(report.expenses[0]).toMatchObject({ amountMinor: GOLDEN_FEE, paidAmountMinor: GOLDEN_FEE, outstandingMinor: 0, settlements: [expect.objectContaining({ accountId: data.accountId, amountMinor: GOLDEN_FEE })] });
    const matches = (await qa.get('bank-matches').query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceBankMatchDto>;
    expect(matches.items).toHaveLength(1); const match = matches.items[0];
    expect(match.components.map(row => row.amountMinor).sort((a, b) => a - b)).toEqual([-150000, -100000, 200000, 200000, 200000, 200000, 200000]);
    expect(match.rows).toHaveLength(1); expect(match.rows[0].consumedAmountMinor).toBe(GOLDEN_DEPOSIT);
    const used = await sources(data.accountId); expect(used).toHaveLength(7); expect(used.every(row => row.residualMinor === 0)).toBe(true);
    const rows = (await statements()).items[0].rows; expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ amountMinor: GOLDEN_DEPOSIT, residualMinor: 0, reservedMinor: GOLDEN_DEPOSIT, status: 'MATCHED' });
    const fresh = (await qa.post('bank-preview', data.statementInput).expect(200)).body as FinanceBankStatementPreview;
    expect(fresh.rows[0].existingRowId).toBe(rows[0].id);
    const duplicate = await qa.command({ ...data.statementIntent, previewToken: fresh.previewToken }).expect(200); expect(duplicate.body.id).toBe(data.statement.id);
    const originalRetry = await qa.command(data.statementIntent, data.statementKey).expect(200); expect(originalRetry.body.id).toBe(data.statement.id);
    expect((await qa.report()).totals).toEqual(report.totals);
    expect(await prisma.payment.count()).toBe(5); expect(await prisma.paymentAdjustment.count()).toBe(1); expect(await prisma.financeExpense.count()).toBe(1); expect(await prisma.financeSettlement.count()).toBe(1); expect(await prisma.financeBankFeeOrigin.count()).toBe(1); expect(await prisma.financeBankRow.count()).toBe(1); expect(await prisma.financeCashMovement.count()).toBe(0);
    for (let index = 0; index < data.originals.length; index++) expect(await paymentFingerprint(prisma, data.originals[index].booking.id)).toBe(data.fingerprints[index]);
    const total = await prisma.$queryRaw<{ gross: string; refund: string; net: string }[]>`SELECT sum("grossRecordedAmountMinor")::text AS gross,sum("refundedAmountMinor")::text AS refund,sum("netRetainedAmountMinor")::text AS net FROM "PaymentEffectiveState" WHERE "businessId"=${fixture.business.id}`;
    expect(total).toEqual([{ gross: '1000000', refund: '100000', net: '900000' }]);
  }, 30000);

  it('a second Owner tenant cannot supply row/source IDs or access Golden J preview; identical unknown preview rejection and no fee/reservation/request/cash partials', async () => {
    const own = await golden(), token = await realFinanceToken(app, fixture.foreignOwner.id), foreignAccount = await bank(token, fixture.foreignBusiness.id);
    const original = await financePaymentFixture(prisma, fixture.foreignActor, 200000);
    await qa.v1({ type: 'LINK_PAYMENT', paymentId: original.payment.id, accountId: foreignAccount, expectedVersion: 0, reason: 'Foreign own receipt.' }, token, fixture.foreignBusiness.id).expect(200);
    const foreign = await importStatement(foreignAccount, 200000, token, fixture.foreignBusiness.id), foreignSource = requiredGolden((await sources(foreignAccount, token, fixture.foreignBusiness.id)).find(row => row.ref.sourceId === original.payment.id));
    const before = await qa.facts(), totals = (await qa.report()).totals;
    const foreignRowId = foreign.statement.rows[0].id, absentRowId = randomUUID();
    const badRow = { ...own.matchInput, rows: [{ ...own.matchInput.rows[0], id: foreignRowId }], fees: own.matchInput.fees.map(fee => ({ ...fee, bankRowId: foreignRowId })) };
    const absentRow = { ...badRow, rows: [{ ...badRow.rows[0], id: absentRowId }], fees: badRow.fees.map(fee => ({ ...fee, bankRowId: absentRowId })) };
    // Match previews report unavailable references as INVALID_INPUT; tenant and unknown IDs are indistinguishable.
    const denied = await qa.post('bank-match-preview', badRow).expect(400), absent = await qa.post('bank-match-preview', absentRow).expect(400);
    expect(denied.body).toEqual({ statusCode: 400, error: 'Bad Request', message: 'BANK_ROW_NOT_FOUND: id' }); expect(absent.body).toEqual(denied.body);
    expectSafeRejection(denied, 400); expectSafeRejection(absent, 400);
    const badSource = { ...own.matchInput, components: [component(foreignSource), ...own.matchInput.components.slice(1)] };
    const unknownSource = { ...badSource, components: [{ ...badSource.components[0], sourceId: randomUUID() }, ...badSource.components.slice(1)] };
    const deniedSource = await qa.post('bank-match-preview', badSource).expect(400), absentSource = await qa.post('bank-match-preview', unknownSource).expect(400);
    expect(deniedSource.body).toEqual({ statusCode: 400, error: 'Bad Request', message: 'SOURCE_NOT_FOUND: sourceId' }); expect(absentSource.body).toEqual(deniedSource.body);
    expectSafeRejection(deniedSource, 400); expectSafeRejection(absentSource, 400);
    expectSafeRejection(await qa.post('bank-match-preview', own.matchInput, token), 403);
    expectSafeRejection(await qa.post('bank-match-preview', own.matchInput, qa.ownerToken, fixture.foreignBusiness.id), 403);
    expect(await qa.facts()).toEqual(before); expect((await qa.report()).totals).toEqual(totals);
    expect(await prisma.financeExpense.count()).toBe(0); expect(await prisma.financeSettlement.count()).toBe(0); expect(await prisma.financeBankMatch.count()).toBe(0);
  }, 30000);
});
