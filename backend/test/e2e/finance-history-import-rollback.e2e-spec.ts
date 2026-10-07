import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceReport } from '../../src/modules/finance/finance.contract';
import type { FinanceHistoryPreview, FinanceV2Result } from '../../src/modules/finance/domain/finance-v2.types';
import { HISTORY_CSV_HEADER } from '../../src/modules/finance/application/finance-v2-import.parser';
import { assertFinanceDatabase, closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, financePeriod, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';

function csvRow(input: Partial<Record<typeof HISTORY_CSV_HEADER[number], string>>): string {
  return HISTORY_CSV_HEADER.map(column => `"${(input[column] ?? '').replaceAll('"', '""')}"`).join(',');
}

describe('FIN016 rollback de lote por fallo de auditoría con AppModule/JWT/PostgreSQL reales', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FinanceFixture;
  let ownerToken: string;
  const root = (businessId = fixture.business.id) => `/api/businesses/${businessId}/finance`;
  const post = (path: string, body: object, key: string = randomUUID(), token = ownerToken) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
  const command = (body: object, key: string) => post(`${root()}/v2/commands`, body, key);
  const report = () => request(app.getHttpServer()).get(root()).set('Authorization', `Bearer ${ownerToken}`).query(financePeriod);

  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); ownerToken = await realFinanceToken(app, fixture.users.OWNER.id); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  async function facts(businessId: string) {
    const [accounts, openings, expenses, settlements, movements, transfers, payments, requests, audits, batches, items] = await Promise.all([
      prisma.financeAccount.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeOpening.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeExpense.findMany({ where: { businessId }, include: { lines: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }),
      prisma.financeSettlement.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeCashMovement.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeTransfer.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.payment.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeRequest.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeAudit.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeImportBatch.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
      prisma.financeImportItem.findMany({ where: { businessId }, orderBy: { id: 'asc' } }),
    ]);
    return { accounts, openings, expenses, settlements, movements, transfers, payments, requests, audits, batches, items };
  }

  async function removeOwnProbe(name: string): Promise<void> {
    try { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "FinanceAudit"`); }
    finally {
      try { await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`); }
      finally { await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS ${name}_seen`); }
    }
  }

  it('Given dos gastos y una liquidación válidos; When falla Audit tras materializar el lote; Then rollback íntegro y recuperación idempotente conservan cada ID una vez', async () => {
    const account = await post(`${root()}/commands`, { type: 'CREATE_ACCOUNT', kind: 'BANK', name: 'Cuenta propia de rollback', opening: { amountMinor: 1000000, occurredAt: '2026-09-01T00:00:00Z', reason: 'Apertura propia conocida.' } }).expect(200);
    const accountId = account.body.id as string;
    const original = await post(`${root()}/commands`, expenseCommand(fixture, 111000)).expect(200);
    const foreignToken = await realFinanceToken(app, fixture.foreignOwner.id);
    await post(`${root(fixture.foreignBusiness.id)}/commands`, { ...expenseCommand(fixture, 777000), counterpartyId: fixture.foreignCounterparty.id, lines: [{ label: 'Original ajeno', categoryId: fixture.foreignCategory.id, resourceId: fixture.foreignResource.id, amountMinor: 777000, operational: true }] }, randomUUID(), foreignToken).expect(200);
    const suffix = randomUUID().replaceAll('-', ''), namespace = `fin016-rollback-${suffix}`, name = `finance_history_qa_${suffix}`, key = randomUUID(), marker = `history_audit_failure_${suffix}`;
    const csv = [HISTORY_CSV_HEADER.join(','),
      csvRow({ rowKind: 'EXPENSE_LINE', rowKey: 'line-a', documentKey: 'expense-a', description: 'Histórico A QA', consumedOn: '2026-09-20', reference: 'Soporte A', documentAmountMinor: '600000', lineOrdinal: '1', label: 'Línea A', categoryId: fixture.category.id, resourceId: fixture.resource.id, lineAmountMinor: '600000', operational: 'true' }),
      csvRow({ rowKind: 'EXPENSE_LINE', rowKey: 'line-b', documentKey: 'expense-b', description: 'Histórico B QA', consumedOn: '2026-09-21', reference: 'Soporte B', documentAmountMinor: '300000', lineOrdinal: '1', label: 'Línea B', categoryId: fixture.category.id, resourceId: fixture.resource.id, lineAmountMinor: '300000', operational: 'true' }),
      csvRow({ rowKind: 'SETTLEMENT', rowKey: 'paid-a', accountId, expenseDocumentKey: 'expense-a', amountMinor: '200000', occurredAt: '2026-09-25T12:00:00Z', includedInOpening: 'false' }),
    ].join('\n');
    const input = { sourceNamespace: namespace, csv }, before = await facts(fixture.business.id), foreignBefore = await facts(fixture.foreignBusiness.id);
    const preview = (await post(`${root()}/v2/history-preview`, input).expect(200)).body as FinanceHistoryPreview;
    expect(preview.issues).toEqual([]);
    expect(preview.sources).toHaveLength(3);
    expect(preview.sources.every(source => source.status === 'NEW')).toBe(true);
    expect(preview.totals).toMatchObject({ expenseMinor: 900000, settlementMinor: 200000, includedCashMinor: -200000, excludedCashMinor: 0 });
    expect(preview.previewToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await facts(fixture.business.id)).toEqual(before);
    const body = { type: 'CONFIRM_HISTORY_IMPORT', ...input, previewToken: preview.previewToken!, reason: marker };
    await assertFinanceDatabase(prisma);
    if (!/^[a-f0-9]{32}$/.test(suffix) || ![fixture.business.id, fixture.users.OWNER.id, accountId, key].every(id => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id))) throw new Error('QA requiere identificadores propios verificados.');
    try {
      await prisma.$executeRawUnsafe(`CREATE SEQUENCE ${name}_seen`);
      await prisma.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $qa$
        BEGIN
          IF NEW."businessId"='${fixture.business.id}' AND NEW."actorUserId"='${fixture.users.OWNER.id}' AND NEW.action='FINANCE_V2.CONFIRM_HISTORY_IMPORT' AND NEW.details->'command'->>'reason'='${marker}' THEN
            IF (SELECT count(*) FROM "FinanceExpense" WHERE "businessId"=NEW."businessId" AND description IN ('Histórico A QA','Histórico B QA'))<>2
              OR (SELECT count(*) FROM "FinanceExpenseLine" l JOIN "FinanceExpense" e ON e.id=l."expenseId" AND e."businessId"=l."businessId" WHERE e."businessId"=NEW."businessId" AND e.description IN ('Histórico A QA','Histórico B QA'))<>2
              OR (SELECT count(*) FROM "FinanceSettlement" WHERE "businessId"=NEW."businessId" AND "accountId"='${accountId}' AND "amountMinor"=200000)<>1
              OR (SELECT count(*) FROM "FinanceImportBatch" WHERE "businessId"=NEW."businessId" AND "sourceNamespace"='${namespace}')<>1
              OR (SELECT count(*) FROM "FinanceImportItem" WHERE "businessId"=NEW."businessId" AND "sourceNamespace"='${namespace}')<>3
              OR (SELECT count(*) FROM "FinanceRequest" WHERE "businessId"=NEW."businessId" AND "idempotencyKey"='${key}')<>0 THEN
              RAISE EXCEPTION 'FIN016_QA_VALID_ROWS_NOT_REACHED';
            END IF;
            PERFORM nextval('${name}_seen');
            RAISE EXCEPTION '${marker}';
          END IF;
          RETURN NEW;
        END;
      $qa$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON "FinanceAudit" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      const failed = await command(body, key).expect(500);
      expect(failed.body).toEqual({ statusCode: 500, message: 'Internal server error' });
      expect(JSON.stringify(failed.body)).not.toContain(marker);
      // nextval no revierte con la transacción: acredita el punto SQL exacto, no un 500 genérico.
      const [probe] = await prisma.$queryRawUnsafe<{ last_value: bigint; is_called: boolean }[]>(`SELECT last_value,is_called FROM ${name}_seen`);
      expect(probe).toEqual({ last_value: 1n, is_called: true });
      expect(await facts(fixture.business.id)).toEqual(before);
      expect(await facts(fixture.foreignBusiness.id)).toEqual(foreignBefore);
      expect(await prisma.financeExpenseLine.count({ where: { businessId: fixture.business.id } })).toBe(1);
      expect(await prisma.financeRequest.count({ where: { businessId: fixture.business.id, idempotencyKey: key } })).toBe(0);
      expect(await prisma.financeAudit.count({ where: { businessId: fixture.business.id, action: 'FINANCE_V2.CONFIRM_HISTORY_IMPORT' } })).toBe(0);
      expect((await report().expect(200)).body.totals).toMatchObject({ operatingCostMinor: 111000, outstandingMinor: 111000, settlementsMinor: 0, registeredBalanceMinor: 1000000 });
    } finally { await removeOwnProbe(name); }

    const recovered = await command(body, key).expect(200), result = recovered.body as FinanceV2Result;
    expect(result).toMatchObject({ type: 'CONFIRM_HISTORY_IMPORT', version: 1, relatedIds: { importBatchId: result.id } });
    const after = await facts(fixture.business.id);
    expect(after.expenses).toHaveLength(3);
    expect(after.expenses.find(expense => expense.id === original.body.id)).toEqual(before.expenses[0]);
    expect(after.expenses.flatMap(expense => expense.lines)).toHaveLength(3);
    const importedA = after.expenses.find(expense => expense.description === 'Histórico A QA'), importedB = after.expenses.find(expense => expense.description === 'Histórico B QA');
    expect(importedA).toMatchObject({ amountMinor: 600000n, version: 2, lines: [{ amountMinor: 600000n, categoryId: fixture.category.id, resourceId: fixture.resource.id }] });
    expect(importedB).toMatchObject({ amountMinor: 300000n, version: 1, lines: [{ amountMinor: 300000n, categoryId: fixture.category.id, resourceId: fixture.resource.id }] });
    expect(after.settlements).toHaveLength(1);
    expect(after.settlements[0]).toMatchObject({ amountMinor: 200000n, accountId, expenseId: importedA!.id });
    expect(after.movements).toEqual(before.movements);
    expect(after.transfers).toEqual(before.transfers);
    expect(after.payments).toEqual(before.payments);
    expect(after.accounts).toEqual(before.accounts);
    expect(after.openings).toEqual(before.openings);
    expect(after.batches).toHaveLength(1);
    expect(after.batches[0].id).toBe(result.id);
    expect(after.items).toHaveLength(3);
    expect(after.items.map(item => item.externalKey).sort()).toEqual(['expense-a', 'expense-b', 'paid-a']);
    expect(new Set(after.items.map(item => item.expenseId ?? item.settlementId)).size).toBe(3);
    expect(after.items.find(item => item.externalKey === 'expense-a')?.expenseId).toBe(importedA!.id);
    expect(after.items.find(item => item.externalKey === 'expense-b')?.expenseId).toBe(importedB!.id);
    expect(after.items.find(item => item.externalKey === 'paid-a')?.settlementId).toBe(after.settlements[0].id);
    expect(after.requests).toHaveLength(before.requests.length + 1);
    expect(after.requests.find(prior => prior.idempotencyKey === key)?.result).toEqual(result);
    expect(after.audits).toHaveLength(before.audits.length + 1);
    expect(after.audits.find(audit => audit.sourceId === result.id)?.details).toMatchObject({ command: { csvDigest: expect.stringMatching(/^[0-9a-f]{64}$/) }, result });
    expect(JSON.stringify(after.audits.find(audit => audit.sourceId === result.id)?.details)).not.toContain(csv);
    for (let retry = 0; retry < 2; retry++) expect((await command(body, key).expect(200)).body).toEqual(result);
    const conflict = await command({ ...body, reason: 'Otra intención después de recuperar el lote.' }, key).expect(409);
    expect(conflict.body).toEqual({ statusCode: 409, error: 'Conflict', message: 'La clave de reintento pertenece a otra intención.' });
    expect(await facts(fixture.business.id)).toEqual(after);
    expect(await facts(fixture.foreignBusiness.id)).toEqual(foreignBefore);
    const refreshed = (await post(`${root()}/v2/history-preview`, input).expect(200)).body as FinanceHistoryPreview;
    expect(refreshed.sources).toHaveLength(3);
    expect(refreshed.sources.every(source => source.status === 'ALREADY_IMPORTED')).toBe(true);
    expect(new Set(refreshed.sources.map(source => source.existingSourceId))).toEqual(new Set(after.items.map(item => item.expenseId ?? item.settlementId)));
    const total = (await report().expect(200)).body as FinanceReport;
    expect(total.totals).toMatchObject({ operatingCostMinor: 1011000, outstandingMinor: 811000, settlementsMinor: 200000, registeredBalanceMinor: 800000 });
    expect(await facts(fixture.business.id)).toEqual(after);
  });
});
