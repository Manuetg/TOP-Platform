import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/modules/business/business.contract';
import type { ConvertCommitmentCommand, FinanceBudgetComparison, FinanceCommitmentDto, FinanceV2Page, FinanceV2Result } from '../../src/modules/finance/domain/finance-v2.types';
import { closeFinanceApp, createFinanceApp, financeFixture, realFinanceToken, resetFinanceDatabase, type FinanceFixture } from '../fixtures/finance-fixture';
import { expectSafeRejection, FinanceGoldensQa, requiredGolden } from './support/finance-goldens.qa';

describe('FIN027: independent real HTTP conversion writers under the own PostgreSQL Business lock', () => {
  let app: INestApplication, prisma: PrismaService, fixture: FinanceFixture, qa: FinanceGoldensQa;
  beforeAll(async () => { app = await createFinanceApp(); prisma = app.get(PrismaService); });
  beforeEach(async () => { await resetFinanceDatabase(prisma); fixture = await financeFixture(prisma); qa = new FinanceGoldensQa(app, prisma, fixture, await realFinanceToken(app, fixture.actor.actorUserId)); });
  afterEach(async () => resetFinanceDatabase(prisma));
  afterAll(async () => { if (app) await closeFinanceApp(app); });
  const conversion = (id: string, expectedVersion = 1, amountMinor = 600000, reason = 'Explicit independent source conversion.'): ConvertCommitmentCommand => ({ type: 'CONVERT_COMMITMENT', id, expectedVersion, expenseDraftId: null, expectedDraftVersion: null, expense: { description: reason, counterpartyId: fixture.counterparty.id, reference: null, amountMinor, lines: [{ label: 'Own real expense', categoryId: fixture.category.id, resourceId: fixture.resource.id, bookingId: null, operational: true, amountMinor }], consumedOn: '2026-09-30', dueOn: '2026-10-10', settlement: null }, reason });
  async function setup(): Promise<{ commitment: FinanceV2Result; approved: unknown[] }> {
    const budget = (await qa.command({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-09', expectedBudgetVersion: 0, lines: [{ categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 1000000 }], reason: 'Synthetic immutable target.' }).expect(200)).body as FinanceV2Result;
    await qa.command({ type: 'APPROVE_BUDGET_REVISION', id: requiredGolden(budget.relatedIds?.revisionId), expectedBudgetVersion: 1, reason: 'Explicitly approved target.' }).expect(200);
    const approved = await prisma.financeBudgetRevision.findMany({ orderBy: { id: 'asc' }, include: { lines: { orderBy: { id: 'asc' } } } });
    const commitment = (await qa.command({ type: 'CREATE_COMMITMENT', description: 'Own pending source', amountMinor: 900000, categoryId: fixture.category.id, resourceId: fixture.resource.id, expectedConsumptionOn: '2026-09-30', dueOn: '2026-10-10', operational: true, reference: null, reason: 'Not actual expense or cash.' }).expect(200)).body as FinanceV2Result;
    return { commitment, approved };
  }
  async function assertPartial(id: string): Promise<void> {
    const page = (await qa.get('commitments').query({ limit: 100 }).expect(200)).body as FinanceV2Page<FinanceCommitmentDto>;
    expect(requiredGolden(page.items.find(row => row.id === id))).toMatchObject({ amountMinor: 900000, consumedMinor: 600000, pendingMinor: 300000, version: 2, state: 'ACTIVE', conversions: [expect.objectContaining({ consumedMinor: 600000 })] });
    const report = (await qa.get('budget-comparison').query({ periodMonth: '2026-09', forecastBasis: 'ACTUAL_PLUS_PENDING_COMMITMENTS' }).expect(200)).body as FinanceBudgetComparison;
    // The public dimension union retains the explicit unassigned remainder even when it is zero.
    expect(report.lines).toEqual([
      { categoryId: fixture.category.id, resourceId: fixture.resource.id, approvedMinor: 1000000, actualMinor: 600000, committedPendingMinor: 300000, forecastMinor: 900000, actualDeviationMinor: -400000, forecastDeviationMinor: -100000 },
      { categoryId: fixture.category.id, resourceId: null, approvedMinor: null, actualMinor: 0, committedPendingMinor: 0, forecastMinor: 0, actualDeviationMinor: null, forecastDeviationMinor: null },
    ]);
    expect(new Set(report.lines.map(row => JSON.stringify([row.categoryId, row.resourceId]))).size).toBe(2);
    expect(report.lines.reduce((sum, row) => sum + row.actualMinor, 0)).toBe(600000);
    expect(report.lines.reduce((sum, row) => sum + row.committedPendingMinor, 0)).toBe(300000);
    expect(report.lines.reduce((sum, row) => sum + (row.forecastMinor ?? 0), 0)).toBe(900000);
    expect(report.lines.reduce((sum, row) => sum + (row.approvedMinor ?? 0), 0)).toBe(1000000);
    expect(await prisma.financeExpense.count()).toBe(1); expect(await prisma.financeExpenseLine.count()).toBe(1); expect(await prisma.financeCommitmentConversion.count()).toBe(1);
    const fact = await prisma.financeCommitmentConversion.findFirstOrThrow({ where: { commitmentId: id } });
    expect(fact).toMatchObject({ businessId: fixture.business.id, consumedMinor: 600000n, recordedByUserId: fixture.actor.actorUserId });
    expect(await prisma.financeExpense.findUniqueOrThrow({ where: { id: fact.expenseId } })).toMatchObject({ businessId: fixture.business.id, amountMinor: 600000n });
    expect(await prisma.financeSettlement.count()).toBe(0); expect(await prisma.financeCashMovement.count()).toBe(0); expect(await prisma.payment.count()).toBe(0);
  }

  it('two600k conversions against900k are both actually blocked; one600k Expense/origin wins, loser409 has no partial rows, budget remains1M', async () => {
    const { commitment, approved } = await setup(), id = commitment.id, keys = [randomUUID(), randomUUID()];
    const bodies = [conversion(id, 1, 600000, 'Writer A: source600k.'), conversion(id, 1, 600000, 'Writer B: source600k.')];
    const responses = await qa.businessRace([async () => await qa.command(bodies[0], keys[0]), async () => await qa.command(bodies[1], keys[1])]);
    expect(responses.map(row => row.status).sort()).toEqual([200, 409]); const winner = responses[0].status === 200 ? 0 : 1, loser = 1 - winner;
    expectSafeRejection(responses[loser], 409); await assertPartial(id);
    expect(await prisma.financeRequest.count({ where: { idempotencyKey: keys[loser] } })).toBe(0);
    expect(await prisma.financeExpense.count({ where: { description: bodies[loser].expense!.description } })).toBe(0);
    await qa.expectOneV2Origin('CONVERT_COMMITMENT', responses[winner].body as FinanceV2Result, keys[winner]);
    const before = await qa.facts(); expectSafeRejection(await qa.command(bodies[loser], keys[loser]), 409);
    expectSafeRejection(await qa.command(conversion(id, 2, 400000)), 400); expect(await qa.facts()).toEqual(before);
    expect((await qa.command(bodies[winner], keys[winner]).expect(200)).body).toEqual(responses[winner].body);
    expect(await prisma.financeBudgetRevision.findMany({ orderBy: { id: 'asc' }, include: { lines: { orderBy: { id: 'asc' } } } })).toEqual(approved);
  }, 30000);

  it('same intent queued twice and recovered after commit returns one Expense/conversion/audit/request with pending300k', async () => {
    const { commitment } = await setup(), body = conversion(commitment.id), key = randomUUID();
    const responses = await qa.businessRace([async () => await qa.command(body, key), async () => await qa.command(body, key)]);
    expect(responses.map(row => row.status)).toEqual([200, 200]); expect(responses[0].body).toEqual(responses[1].body);
    expect((await qa.command(body, key).expect(200)).body).toEqual(responses[0].body); await assertPartial(commitment.id);
    await qa.expectOneV2Origin('CONVERT_COMMITMENT', responses[0].body as FinanceV2Result, key);
    const before = await qa.facts(); expectSafeRejection(await qa.command({ ...body, reason: 'Different immutable intention.' }, key), 409); expect(await qa.facts()).toEqual(before);
  }, 30000);

  it('two Owner tenants cannot convert or resolve a foreign commitment; unknown and foreign IDs have indistinguishable404/no partial facts', async () => {
    const { commitment } = await setup(), token = await realFinanceToken(app, fixture.foreignOwner.id);
    const foreign = (await qa.command({ type: 'CREATE_COMMITMENT', description: 'Foreign own source', amountMinor: 900000, categoryId: fixture.foreignCategory.id, resourceId: fixture.foreignResource.id, expectedConsumptionOn: '2026-09-30', dueOn: null, operational: true, reference: null, reason: 'Other owner source.' }, randomUUID(), token, fixture.foreignBusiness.id).expect(200)).body as FinanceV2Result;
    const before = await qa.facts();
    const denied = await qa.command(conversion(foreign.id)).expect(404), absent = await qa.command(conversion(randomUUID())).expect(404); expect(denied.body).toEqual(absent.body);
    expectSafeRejection(await qa.command(conversion(commitment.id), randomUUID(), token), 403);
    expectSafeRejection(await qa.command(conversion(foreign.id), randomUUID(), qa.ownerToken, fixture.foreignBusiness.id), 403);
    expect(await qa.facts()).toEqual(before); expect(await prisma.financeExpense.count()).toBe(0); expect(await prisma.financeCommitmentConversion.count()).toBe(0);
  });

  it('revoked current membership cannot replay a committed conversion from the old Owner JWT or expose commitment details', async () => {
    const { commitment } = await setup(), body = conversion(commitment.id), key = randomUUID();
    await qa.command(body, key).expect(200); await assertPartial(commitment.id); const before = await qa.facts();
    await prisma.userBusinessMembership.delete({ where: { userId_businessId: { userId: fixture.actor.actorUserId, businessId: fixture.business.id } } });
    expectSafeRejection(await qa.command(body, key), 403); await qa.get('commitments').query({ limit: 100 }).expect(403); expect(await qa.facts()).toEqual(before);
  });
});
