import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceCostReport, FinanceLaborCostDto, FinanceResourceReport, FinanceV2Page, FinanceV2Result } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';

const period = { from: '2026-09-01', to: '2026-10-01' };

describe('FIN023/025 Golden C y D por HTTP, JWT y PostgreSQL reales, sin overrides', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FinanceFixture;
  let ownerToken: string;
  let foreignToken: string;
  let resourceIds: [string, string, string];
  const root = (businessId = fixture.business.id) => `/api/businesses/${businessId}/finance`;
  const post = (path: string, body: object, key: string = randomUUID(), token = ownerToken) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
  const command = (body: object, key: string = randomUUID()) => post(`${root()}/v2/commands`, body, key);
  const get = (path: string, token = ownerToken, businessId = fixture.business.id) => request(app.getHttpServer()).get(`${root(businessId)}/v2/${path}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => {
    await resetFinanceDatabase(prisma);
    fixture = await financeFixture(prisma);
    ownerToken = await realFinanceToken(app, fixture.users.OWNER.id);
    foreignToken = await realFinanceToken(app, fixture.foreignOwner.id);
    const second = await prisma.resource.create({ data: { businessId: fixture.business.id, name: 'Segundo destino propio', internalCode: 'GOLDEN-CD-2', capacityMaximum: 2 } });
    const third = await prisma.resource.create({ data: { businessId: fixture.business.id, name: 'Tercer destino propio', internalCode: 'GOLDEN-CD-3', capacityMaximum: 2 } });
    resourceIds = [fixture.resource.id, second.id, third.id];
    await post(`${root(fixture.foreignBusiness.id)}/commands`, {
      ...expenseCommand(fixture, 700000), counterpartyId: fixture.foreignCounterparty.id, reference: 'Soporte declarado del otro negocio',
      lines: [{ label: 'Fuente común ajena', categoryId: fixture.foreignCategory.id, resourceId: null, amountMinor: 700000, operational: true }],
    }, randomUUID(), foreignToken).expect(200);
  });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  async function commonExpense(amountMinor: number): Promise<{ expenseId: string; lineId: string }> {
    const created = await post(`${root()}/commands`, {
      ...expenseCommand(fixture, amountMinor), reference: 'Comprobante sintético declarado por Owner',
      lines: [{ label: 'Una fuente común canónica', categoryId: fixture.category.id, resourceId: null, amountMinor, operational: true }],
    }).expect(200);
    const line = await prisma.financeExpenseLine.findFirstOrThrow({ where: { businessId: fixture.business.id, expenseId: created.body.id as string } });
    return { expenseId: created.body.id as string, lineId: line.id };
  }

  async function rule(parts: { resourceId: string; basisPoints: number }[]): Promise<FinanceV2Result> {
    return (await command({ type: 'CREATE_ALLOCATION_RULE', name: 'Regla explícita Golden C/D', validFrom: '2026-09-01', validTo: null, parts }).expect(200)).body as FinanceV2Result;
  }

  async function concurrentAllocation(lineId: string, ruleId: string): Promise<FinanceV2Result> {
    const body = { type: 'APPLY_COST_ALLOCATION', source: { kind: 'EXPENSE_LINE', id: lineId }, expectedSourceVersion: 1, ruleId, ruleVersion: 1, expectedAllocationVersion: 0, reason: 'Owner distribuye una fuente exacta una sola vez.' };
    const key = randomUUID();
    const [first, retry] = await Promise.all([command(body, key).expect(200), command(body, key).expect(200)]);
    expect(retry.body).toEqual(first.body);
    expect(first.body).toMatchObject({ type: 'APPLY_COST_ALLOCATION', version: 1 });
    const allocation = await prisma.financeCostAllocation.findUniqueOrThrow({ where: { id: first.body.id as string }, include: { parts: true } });
    expect(allocation).toMatchObject({ businessId: fixture.business.id, sourceExpenseLineId: lineId, sourceLaborRevisionId: null, sourceVersion: 1, revisionNo: 1, sourceBasis: 'ACTUAL', unassignedMinor: 0n });
    expect(allocation.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(allocation.parts).toHaveLength(3);
    expect(await prisma.financeCostAllocation.count({ where: { businessId: fixture.business.id } })).toBe(1);
    const before = await ownFacts();
    await command(body).expect(409);
    const invalidVersion = await command({ ...body, expectedSourceVersion: 0, expectedAllocationVersion: 1 }).expect(400);
    expect(invalidVersion.body).toEqual({ statusCode: 400, error: 'Bad Request', message: 'Entero financiero inválido.' });
    const sourceConflict = await command({ ...body, expectedSourceVersion: 2, expectedAllocationVersion: 1 }).expect(409);
    expect(sourceConflict.body).toEqual({ statusCode: 409, error: 'Conflict', message: 'La versión cambió. Conserva el borrador y actualiza la fuente.' });
    await command({ ...body, ruleVersion: 2, expectedAllocationVersion: 1 }).expect(409);
    expect(await ownFacts()).toEqual(before);
    return first.body as FinanceV2Result;
  }

  async function reports(): Promise<{ costs: FinanceCostReport; results: FinanceResourceReport }> {
    const query = { ...period, asOf: new Date().toISOString() };
    const before = await ownFacts();
    const costResponse = await get('costs').query(query).expect(200);
    const resultResponse = await get('resource-results').query(query).expect(200);
    const costs = costResponse.body as FinanceCostReport, results = resultResponse.body as FinanceResourceReport;
    expect(costResponse.headers['cache-control']).toBe('no-store');
    expect(resultResponse.headers['cache-control']).toBe('no-store');
    expect(results.costToken).toBe(costs.token);
    expect((await get('costs').query({ ...query, sourceToken: costs.token }).expect(200)).body).toEqual(costs);
    expect((await get('resource-results').query({ ...query, sourceToken: results.token }).expect(200)).body).toEqual(results);
    expect(costs).toMatchObject({ businessId: fixture.business.id, currency: 'PYG', coverage: { missingEvidenceSourceIds: [], unknownSourceIds: [], unsupportedReasons: [] } });
    expect(JSON.stringify({ costs, results })).not.toContain(fixture.foreignBusiness.id);
    expect(JSON.stringify({ costs, results })).not.toContain(fixture.foreignResource.id);
    expect(await ownFacts()).toEqual(before);
    const foreign = (await get('costs', foreignToken, fixture.foreignBusiness.id).query(query).expect(200)).body as FinanceCostReport;
    expect(foreign.totals.actualCostMinor).toBe(700000);
    expect(foreign.rows).toHaveLength(1);
    return { costs, results };
  }

  async function ownFacts() {
    const businessId = fixture.business.id;
    const [expenses, labor, allocations, requests, audits, settlements, transfers, movements, payments] = await Promise.all([
      prisma.financeExpense.findMany({ where: { businessId }, include: { lines: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } }),
      prisma.financeLaborCost.findMany({ where: { businessId }, include: { revisions: { orderBy: { revisionNo: 'asc' } } }, orderBy: { id: 'asc' } }),
      prisma.financeCostAllocation.findMany({ where: { businessId }, include: { parts: { orderBy: { resourceId: 'asc' } } }, orderBy: { id: 'asc' } }),
      prisma.financeRequest.count({ where: { businessId } }), prisma.financeAudit.count({ where: { businessId } }),
      prisma.financeSettlement.count({ where: { businessId } }), prisma.financeTransfer.count({ where: { businessId } }),
      prisma.financeCashMovement.count({ where: { businessId } }), prisma.payment.count({ where: { businessId } }),
    ]);
    return { expenses, labor, allocations, requests, audits, settlements, transfers, movements, payments };
  }

  it('Golden C: gasto común 1M y pesos60/30/10 producen600k/300k/100k, conservación empresarial y replay concurrente sin duplicar', async () => {
    const source = await commonExpense(1000000);
    const allocationRule = await rule([{ resourceId: resourceIds[0], basisPoints: 6000 }, { resourceId: resourceIds[1], basisPoints: 3000 }, { resourceId: resourceIds[2], basisPoints: 1000 }]);
    await concurrentAllocation(source.lineId, allocationRule.id);
    const { costs, results } = await reports();
    expect(costs.rows).toHaveLength(1);
    expect(costs.totals).toEqual({ actualCostMinor: 1000000, estimatedSelectedMinor: 0, ownerImputedMinor: 0, unknownSourceCount: 0 });
    const row = costs.rows[0];
    expect(row).toMatchObject({ source: { kind: 'EXPENSE_LINE', id: source.lineId, version: 1 }, expenseId: source.expenseId, expenseLineId: source.lineId, basis: 'ACTUAL', kind: 'COMMON', amountMinor: 1000000, ruleId: allocationRule.id, ruleVersion: 1, allocationVersion: 1, unassignedMinor: 0 });
    expect(row.destinations).toHaveLength(3);
    expect(row.destinations).toEqual(expect.arrayContaining([{ resourceId: resourceIds[0], amountMinor: 600000 }, { resourceId: resourceIds[1], amountMinor: 300000 }, { resourceId: resourceIds[2], amountMinor: 100000 }]));
    expect(row.destinations.reduce((sum, part) => sum + part.amountMinor, row.unassignedMinor!)).toBe(1000000);
    expect(results.rows.find(part => part.resourceId === resourceIds[0])).toMatchObject({ commonActualCostMinor: 600000, operatingResultBeforeOwnerWorkMinor: -600000 });
    expect(results.rows.find(part => part.resourceId === resourceIds[1])).toMatchObject({ commonActualCostMinor: 300000, operatingResultBeforeOwnerWorkMinor: -300000 });
    expect(results.rows.find(part => part.resourceId === resourceIds[2])).toMatchObject({ commonActualCostMinor: 100000, operatingResultBeforeOwnerWorkMinor: -100000 });
    expect(results.rows.find(part => part.resourceId === null)).toMatchObject({ commonActualCostMinor: 0 });
    expect(results.business).toMatchObject({ recognizedRevenueMinor: 0, directActualCostMinor: 0, commonActualCostMinor: 1000000, selectedEstimatedCostMinor: 0, ownerImputedMinor: 0, operatingResultBeforeOwnerWorkMinor: -1000000, resultAfterOwnerWorkMinor: -1000000, status: 'COMPLETE', sourceKeys: [`EXPENSE_LINE:${source.lineId}`] });
    expect(results.rows.reduce((sum, part) => sum + part.commonActualCostMinor, 0)).toBe(1000000);
    const foreignLine = await prisma.financeExpenseLine.findFirstOrThrow({ where: { businessId: fixture.foreignBusiness.id } });
    const before = await ownFacts();
    const denied = await command({ type: 'APPLY_COST_ALLOCATION', source: { kind: 'EXPENSE_LINE', id: foreignLine.id }, expectedSourceVersion: 1, ruleId: allocationRule.id, ruleVersion: 1, expectedAllocationVersion: 0, reason: 'Intento de fuente de otro negocio.' }).expect(404);
    expect(JSON.stringify(denied.body)).not.toContain(foreignLine.id);
    expect(await ownFacts()).toEqual(before);
    expect(before).toMatchObject({ settlements: 0, transfers: 0, movements: 0, payments: 0 });
    expect(before.expenses).toHaveLength(1);
  });

  it('Golden D: labor real3M a70/20/10 produce2.1M/600k/300k; estimado3.2M se conserva en detalle Owner sin sumarse al actual', async () => {
    const estimated = (await command({ type: 'CREATE_LABOR_COST', label: 'Labor Golden D', personLabel: 'Detalle laboral privado Owner', periodMonth: '2026-09', consumedOn: '2026-09-30', kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: 3200000, reason: 'Estimación explícita calculada fuera del módulo.' }).expect(200)).body as FinanceV2Result;
    const initial = (await get('costs').query({ ...period, asOf: new Date().toISOString() }).expect(200)).body as FinanceCostReport;
    expect(initial.totals).toEqual({ actualCostMinor: 0, estimatedSelectedMinor: 3200000, ownerImputedMinor: 0, unknownSourceCount: 0 });
    const source = await commonExpense(3000000);
    const revision = { type: 'REVISE_LABOR_COST', id: estimated.id, expectedVersion: 1, actualExpenseLineId: source.lineId, estimatedMinor: 3200000, reason: 'Documento real sustituye la estimación sin perder procedencia.' };
    const key = randomUUID();
    const revised = await command(revision, key).expect(200);
    expect((await command(revision, key).expect(200)).body).toEqual(revised.body);
    expect(revised.body).toMatchObject({ id: estimated.id, version: 2, type: 'REVISE_LABOR_COST' });
    const allocationRule = await rule([{ resourceId: resourceIds[0], basisPoints: 7000 }, { resourceId: resourceIds[1], basisPoints: 2000 }, { resourceId: resourceIds[2], basisPoints: 1000 }]);
    await concurrentAllocation(source.lineId, allocationRule.id);
    const { costs, results } = await reports();
    expect(costs.rows).toHaveLength(1);
    expect(costs.totals).toEqual({ actualCostMinor: 3000000, estimatedSelectedMinor: 0, ownerImputedMinor: 0, unknownSourceCount: 0 });
    const row = costs.rows[0];
    expect(row).toMatchObject({ source: { kind: 'EXPENSE_LINE', id: source.lineId, version: 1 }, expenseLineId: source.lineId, basis: 'ACTUAL', kind: 'LABOR', amountMinor: 3000000, ruleId: allocationRule.id, ruleVersion: 1, allocationVersion: 1, unassignedMinor: 0 });
    expect(row.destinations).toHaveLength(3);
    expect(row.destinations).toEqual(expect.arrayContaining([{ resourceId: resourceIds[0], amountMinor: 2100000 }, { resourceId: resourceIds[1], amountMinor: 600000 }, { resourceId: resourceIds[2], amountMinor: 300000 }]));
    expect(row.destinations.reduce((sum, part) => sum + part.amountMinor, row.unassignedMinor!)).toBe(3000000);
    expect(results.rows.find(part => part.resourceId === resourceIds[0])).toMatchObject({ commonActualCostMinor: 2100000, selectedEstimatedCostMinor: 0, operatingResultBeforeOwnerWorkMinor: -2100000 });
    expect(results.rows.find(part => part.resourceId === resourceIds[1])).toMatchObject({ commonActualCostMinor: 600000, selectedEstimatedCostMinor: 0, operatingResultBeforeOwnerWorkMinor: -600000 });
    expect(results.rows.find(part => part.resourceId === resourceIds[2])).toMatchObject({ commonActualCostMinor: 300000, selectedEstimatedCostMinor: 0, operatingResultBeforeOwnerWorkMinor: -300000 });
    expect(results.business).toMatchObject({ recognizedRevenueMinor: 0, commonActualCostMinor: 3000000, selectedEstimatedCostMinor: 0, ownerImputedMinor: 0, operatingResultBeforeOwnerWorkMinor: -3000000, resultAfterOwnerWorkMinor: -3000000, status: 'COMPLETE', sourceKeys: [`EXPENSE_LINE:${source.lineId}`] });
    expect(results.rows.reduce((sum, part) => sum + part.commonActualCostMinor, 0)).toBe(3000000);
    const details = (await get('labor-costs').expect(200)).body as FinanceV2Page<FinanceLaborCostDto>;
    expect(details.items).toHaveLength(1);
    expect(details.items[0]).toMatchObject({ id: estimated.id, businessId: fixture.business.id, personLabel: 'Detalle laboral privado Owner', version: 2 });
    expect(details.items[0].revisions).toHaveLength(2);
    expect(details.items[0].revisions).toEqual(expect.arrayContaining([expect.objectContaining({ revisionNo: 1, actualExpenseLineId: null, estimatedMinor: 3200000 }), expect.objectContaining({ revisionNo: 2, actualExpenseLineId: source.lineId, estimatedMinor: 3200000 })]));
    const before = await ownFacts();
    await command(revision).expect(409);
    await command({ type: 'APPLY_COST_ALLOCATION', source: { kind: 'LABOR_ESTIMATE', id: estimated.id }, expectedSourceVersion: 2, ruleId: allocationRule.id, ruleVersion: 1, expectedAllocationVersion: 0, reason: 'La estimación ya sustituida no vuelve a asignarse.' }).expect(409);
    for (const role of ['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const) {
      const denied = await get('labor-costs', await realFinanceToken(app, fixture.users[role].id)).expect(403);
      expect(JSON.stringify(denied.body)).not.toContain('Detalle laboral privado Owner');
      expect(denied.body).not.toHaveProperty('items');
    }
    expect((await get('labor-costs', foreignToken, fixture.foreignBusiness.id).expect(200)).body.items).toEqual([]);
    expect(await ownFacts()).toEqual(before);
    expect(before).toMatchObject({ settlements: 0, transfers: 0, movements: 0, payments: 0 });
    expect(before.expenses).toHaveLength(1);
    expect(before.labor).toHaveLength(1);
    expect(before.labor[0].revisions).toHaveLength(2);
  });
});
