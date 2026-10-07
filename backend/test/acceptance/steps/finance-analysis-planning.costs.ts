import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import type { FinanceResourceReport } from '../../../src/modules/finance/domain/finance-v2.types';
import { analysisCosts, analysisCut, analysisExpense, analysisGet, analysisMonth, analysisPost, type AnalysisWorld } from './finance-analysis-planning.support';

export async function commonCost(world: AnalysisWorld, amount: number): Promise<void> {
  world.anOtherResourceId = (await world.financePrisma.resource.create({ data: { businessId: world.financeFixture.business.id, name: 'Segundo recurso de aceptación', internalCode: 'GWT2', capacityMaximum: 2 } })).id;
  await analysisExpense(world, amount, null);
}
export async function allocateCommon(world: AnalysisWorld): Promise<void> {
  const rule = await analysisPost(world, 'v2/commands', { type: 'CREATE_ALLOCATION_RULE', name: 'Reparto explícito GWT', validFrom: '2026-09-01', validTo: null, parts: [{ resourceId: world.financeFixture.resource.id, basisPoints: 5000 }, { resourceId: world.anOtherResourceId, basisPoints: 2500 }] }).expect(200);
  world.anRuleId = rule.body.id as string; world.anKey = randomUUID();
  world.anIntent = { type: 'APPLY_COST_ALLOCATION', source: { kind: 'EXPENSE_LINE', id: world.anLineId }, expectedSourceVersion: 1, ruleId: world.anRuleId, ruleVersion: 1, expectedAllocationVersion: 0, reason: 'OWNER decide esta asignación parcial.' };
  world.anFirst = await analysisPost(world, 'v2/commands', world.anIntent, world.anKey).expect(200);
}
export async function allocationGolden(world: AnalysisWorld, first: number, second: number, unassigned: number): Promise<void> {
  const report = await analysisCosts(world), row = report.rows.find(value => value.expenseLineId === world.anLineId);
  assert.ok(row); assert.equal(row.amountMinor, 500001); assert.equal(row.source.version, 1);
  assert.equal(row.ruleId, world.anRuleId); assert.equal(row.ruleVersion, 1); assert.equal(row.allocationVersion, 1);
  assert.equal(row.destinations.find(value => value.resourceId === world.financeFixture.resource.id)?.amountMinor, first);
  assert.equal(row.destinations.find(value => value.resourceId === world.anOtherResourceId)?.amountMinor, second);
  assert.equal(row.unassignedMinor, unassigned); assert.equal(first + second + unassigned, 500001);
  assert.equal(report.totals.actualCostMinor, 500001);
}
export async function allocationRetry(world: AnalysisWorld): Promise<void> {
  const replay = await analysisPost(world, 'v2/commands', world.anIntent, world.anKey).expect(200);
  assert.deepEqual(replay.body, world.anFirst.body);
  await analysisPost(world, 'v2/commands', world.anIntent).expect(409);
  assert.equal(await world.financePrisma.financeCostAllocation.count(), 1);
}
export async function resourceGolden(world: AnalysisWorld): Promise<void> {
  const report = (await analysisGet(world, 'v2/resource-results').query({ ...analysisMonth, asOf: analysisCut() }).expect(200)).body as FinanceResourceReport;
  assert.equal(report.business.recognizedRevenueMinor, 600000);
  assert.equal(report.business.directActualCostMinor + report.business.commonActualCostMinor, 600001);
  assert.equal(report.business.operatingResultBeforeOwnerWorkMinor, -1);
  const own = report.rows.find(value => value.resourceId === world.financeFixture.resource.id), other = report.rows.find(value => value.resourceId === world.anOtherResourceId), rest = report.rows.find(value => value.resourceId === null);
  assert.ok(own && other && rest);
  assert.equal(own.operatingResultBeforeOwnerWorkMinor, 250000); assert.equal(own.directActualCostMinor, 100000); assert.equal(own.commonActualCostMinor, 250000);
  assert.equal(other.recognizedRevenueMinor, 0); assert.equal(other.commonActualCostMinor, 125000);
  assert.equal(rest.commonActualCostMinor, 125001);
}
export async function laborEstimate(world: AnalysisWorld, amount: number): Promise<void> {
  const response = await analysisPost(world, 'v2/commands', { type: 'CREATE_LABOR_COST', label: 'Personal calculado', personLabel: 'Etiqueta sintética', periodMonth: '2026-09', consumedOn: '2026-09-30', kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: amount, reason: 'Estimación explícita antes del documento.' }).expect(200);
  world.anLaborId = response.body.id as string;
  assert.equal((await analysisCosts(world)).totals.estimatedSelectedMinor, amount);
}
export async function replaceLabor(world: AnalysisWorld, actual: number, owner: number): Promise<void> {
  await analysisExpense(world, actual);
  await analysisPost(world, 'v2/commands', { type: 'REVISE_LABOR_COST', id: world.anLaborId, expectedVersion: 1, actualExpenseLineId: world.anLineId, estimatedMinor: null, reason: 'Documento real sustituye estimación.' }).expect(200);
  await analysisPost(world, 'v2/commands', { type: 'CREATE_LABOR_COST', label: 'Trabajo propio OWNER', personLabel: null, periodMonth: '2026-09', consumedOn: '2026-09-30', kind: 'OWNER_IMPUTED', actualExpenseLineId: null, estimatedMinor: owner, reason: 'Costo de oportunidad explícito del OWNER.' }).expect(200);
}
export async function unknownLabor(world: AnalysisWorld): Promise<void> {
  await analysisPost(world, 'v2/commands', { type: 'CREATE_LABOR_COST', label: 'Personal pendiente de importe', personLabel: null, periodMonth: '2026-09', consumedOn: '2026-09-30', kind: 'PRECOMPUTED_LABOR', actualExpenseLineId: null, estimatedMinor: null, reason: 'Importe aún desconocido.' }).expect(200);
  const report = await analysisCosts(world), missing = report.rows.find(value => value.amountMinor === null);
  assert.ok(missing); assert.equal(missing.unassignedMinor, null); assert.equal(missing.basis, 'ESTIMATE'); assert.equal(report.totals.unknownSourceCount, 1);
  assert.ok(report.coverage.unknownSourceIds.length > 0);
}
