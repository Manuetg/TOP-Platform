import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { FinanceBudgetComparison } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp, createFinanceApp, expenseCommand, financeFixture, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';

describe('FIN026 previsión de costos opt-in por AppModule/PG real, sin overrides', () => {
  let app: INestApplication, prisma: PrismaClient, fixture: FinanceFixture, ownerToken: string;
  const root = () => `/api/businesses/${fixture.business.id}/finance`;
  const command = (body: object) => request(app.getHttpServer()).post(`${root()}/v2/commands`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', randomUUID()).send(body);
  const comparison = (forecastBasis?: string) => request(app.getHttpServer()).get(`${root()}/v2/budget-comparison`).set('Authorization', `Bearer ${ownerToken}`).query({ periodMonth: '2026-09', ...(forecastBasis === undefined ? {} : { forecastBasis }) });
  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); ownerToken = await realFinanceToken(app, fixture.users.OWNER.id); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });

  it('Given meta aprobada 1M y actual600k/compromiso600k; When opt-in; Then previsión1.2M/desvío200k con meta intacta y sin hechos de caja', async () => {
    const proposed = await command({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-09', expectedBudgetVersion: 0, lines: [{ categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 1000000 }], reason: 'Meta manual aprobada por Owner.' }).expect(200);
    await command({ type: 'APPROVE_BUDGET_REVISION', id: proposed.body.relatedIds.revisionId as string, expectedBudgetVersion: 1, reason: 'Owner aprueba la revisión exacta.' }).expect(200);
    await request(app.getHttpServer()).post(`${root()}/commands`).set('Authorization', `Bearer ${ownerToken}`).set('Idempotency-Key', randomUUID()).send(expenseCommand(fixture, 600000)).expect(200);
    await command({ type: 'CREATE_COMMITMENT', description: 'Compra operativa pendiente del mismo mes', amountMinor: 600000, categoryId: fixture.category.id, resourceId: fixture.resource.id, expectedConsumptionOn: '2026-09-30', dueOn: '2026-10-10', operational: true, reference: null, reason: 'Compromiso registrado, todavía no es gasto.' }).expect(200);
    const metaBefore = await prisma.financeBudget.findUniqueOrThrow({ where: { id: proposed.body.id as string }, include: { revisions: { include: { lines: true } } } });
    const moneyBefore = await moneyCounts(prisma); const requestsBefore = await prisma.financeRequest.count();

    const original = (await comparison().expect(200)).body as FinanceBudgetComparison;
    expect(original).toMatchObject({ forecastBasis: null, scenarioToken: null, budgetId: metaBefore.id, budgetVersion: 2, approvedRevisionId: proposed.body.relatedIds.revisionId as string });
    expect(original.lines.find(row => row.resourceId === fixture.resource.id)).toMatchObject({ approvedMinor: 1000000, actualMinor: 600000, committedPendingMinor: 600000, forecastMinor: null, forecastDeviationMinor: null });
    const projected = (await comparison('ACTUAL_PLUS_PENDING_COMMITMENTS').expect(200)).body as FinanceBudgetComparison;
    expect(projected.lines.find(row => row.resourceId === fixture.resource.id)).toMatchObject({ approvedMinor: 1000000, actualMinor: 600000, committedPendingMinor: 600000, forecastMinor: 1200000, forecastDeviationMinor: 200000, actualDeviationMinor: -400000 });
    expect(projected).toMatchObject({ forecastBasis: 'ACTUAL_PLUS_PENDING_COMMITMENTS', token: original.token, estimatedSelectedMinor: 0, ownerImputedMinor: 0, coverage: { scope: 'KNOWN_OPERATING_SOURCES_ONLY', sourceLimit: 5000, pendingCommitmentSourceCount: 1 } });
    expect(projected.coverage.costSourceToken).toMatch(/^[0-9a-f]{64}$/); expect(projected.scenarioToken).toMatch(/^[0-9a-f]{64}$/); expect(Number.isFinite(Date.parse(projected.asOf))).toBe(true);

    expect(await prisma.financeBudget.findUniqueOrThrow({ where: { id: metaBefore.id }, include: { revisions: { include: { lines: true } } } })).toEqual(metaBefore);
    expect(await prisma.financeRequest.count()).toBe(requestsBefore); expect(await moneyCounts(prisma)).toEqual(moneyBefore);
    expect(moneyBefore).toMatchObject({ payment: 0, settlement: 0, transfer: 0, cashMovement: 0, expense: 1 });
    await comparison('SCENARIO').expect(400);
    await request(app.getHttpServer()).get(`${root()}/v2/budget-comparison`).set('Authorization', `Bearer ${ownerToken}`).query({ periodMonth: '2026-09', forecastBasis: 'ACTUAL_PLUS_PENDING_COMMITMENTS', amountMinor: 1200000 }).expect(400);
  });

  async function approvedBudget(): Promise<string> {
    const proposed = await command({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-09', expectedBudgetVersion: 0, lines: [{ categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 1000000 }], reason: 'Meta privada para verificar autorización.' }).expect(200);
    await command({ type: 'APPROVE_BUDGET_REVISION', id: proposed.body.relatedIds.revisionId as string, expectedBudgetVersion: 1, reason: 'Snapshot aprobado por Owner.' }).expect(200);
    return proposed.body.id as string;
  }

  async function deniedComparison(budgetId: string, token: string | null, expectedStatus: 401 | 403, businessId = fixture.business.id): Promise<void> {
    const before = await authorizationSnapshot(prisma, budgetId);
    const call = request(app.getHttpServer()).get(`/api/businesses/${businessId}/finance/v2/budget-comparison`).query({ periodMonth: '2026-09', forecastBasis: 'ACTUAL_PLUS_PENDING_COMMITMENTS' });
    if (token !== null) call.set('Authorization', `Bearer ${token}`);
    const response = await call.expect(expectedStatus);
    expect(response.body).toMatchObject({ statusCode: expectedStatus });
    for (const field of ['budgetId', 'budgetVersion', 'approvedRevisionId', 'businessId', 'lines', 'asOf', 'token', 'scenarioToken', 'forecastBasis', 'coverage']) expect(response.body).not.toHaveProperty(field);
    expect(JSON.stringify(response.body)).not.toContain(budgetId);
    expect(JSON.stringify(response.body)).not.toContain(fixture.category.id);
    expect(JSON.stringify(response.body)).not.toContain(fixture.resource.id);
    expect(await authorizationSnapshot(prisma, budgetId)).toEqual(before);
  }

  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'] as const)('Given %s con membresía vigente; When solicita previsión; Then 403 sin datos ni escrituras', async role => {
    const budgetId = await approvedBudget(), token = await realFinanceToken(app, fixture.users[role].id);
    await deniedComparison(budgetId, token, 403);
  });

  it('Given solicitud sin JWT; When solicita una meta existente; Then 401 sin campos financieros ni escrituras', async () => {
    await deniedComparison(await approvedBudget(), null, 401);
  });

  it('Given Owners de distintos negocios; When cruzan el businessId de la ruta; Then 403 sin datos ni escrituras', async () => {
    const budgetId = await approvedBudget(), foreignToken = await realFinanceToken(app, fixture.foreignOwner.id);
    await deniedComparison(budgetId, ownerToken, 403, fixture.foreignBusiness.id);
    await deniedComparison(budgetId, foreignToken, 403);
  });

  it('Given JWT Owner emitido antes de revocar membresía; When solicita previsión; Then 403 con revalidación actual y cero escrituras', async () => {
    const budgetId = await approvedBudget();
    await prisma.userBusinessMembership.deleteMany({ where: { businessId: fixture.business.id, userId: fixture.users.OWNER.id } });
    await deniedComparison(budgetId, ownerToken, 403);
  });
});

async function authorizationSnapshot(prisma: PrismaClient, budgetId: string) {
  const [budget, requests, audits, commitments, money] = await Promise.all([
    prisma.financeBudget.findUniqueOrThrow({ where: { id: budgetId }, include: { revisions: { include: { lines: true } } } }),
    prisma.financeRequest.count(), prisma.financeAudit.count(), prisma.financeCommitment.count(), moneyCounts(prisma),
  ]);
  return { budget, requests, audits, commitments, money };
}

async function moneyCounts(prisma: PrismaClient): Promise<{ payment: number; settlement: number; transfer: number; cashMovement: number; expense: number }> {
  const [payment, settlement, transfer, cashMovement, expense] = await Promise.all([prisma.payment.count(), prisma.financeSettlement.count(), prisma.financeTransfer.count(), prisma.financeCashMovement.count(), prisma.financeExpense.count()]);
  return { payment, settlement, transfer, cashMovement, expense };
}
