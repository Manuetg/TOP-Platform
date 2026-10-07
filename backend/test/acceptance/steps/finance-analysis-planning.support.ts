import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request, { type Response, type Test } from 'supertest';
import type { ExpenseDefinition, FinanceBudgetComparison, FinanceCashProjection, FinanceCashProjectionInput, FinanceCostReport } from '../../../src/modules/finance/domain/finance-v2.types';
import type { FinanceAlertsReadResult } from '../../../src/modules/finance/infrastructure/finance-v2-alerts.read-service';
import { expenseCommand, type FinanceFixture } from '../../fixtures/finance-fixture';
import { TopWorld } from '../support/world';

/** Los campos finance* los inicializa únicamente el harness @financeReal existente. */
export interface AnalysisWorld extends TopWorld {
  financePrisma: PrismaClient; financeFixture: FinanceFixture; financeToken: string; financeAccountId: string;
  recBookingId: string; anExpenseId: string; anLineId: string; anOtherResourceId: string; anRuleId: string;
  anIntent: object; anKey: string; anFirst: Response; anResponses: Response[]; anBefore: object;
  anLaborId: string; anCosts: FinanceCostReport; anBudgetId: string; anApprovedBefore: object;
  anCommitmentId: string; anComparison: FinanceBudgetComparison; anProjection: FinanceCashProjection;
  anProjectionInput: FinanceCashProjectionInput; anAlertReads: FinanceAlertsReadResult[]; anAlertId: string;
  anClock: { asOf: string; today: string };
}

export const analysisMonth = { from: '2026-09-01', to: '2026-10-01' };
export const analysisCut = (): string => new Date().toISOString();
export const analysisRoot = (world: AnalysisWorld): string => `/api/businesses/${world.financeFixture.business.id}/finance`;
export function analysisGet(world: AnalysisWorld, path: string, token = world.financeToken): Test {
  return request(world.app!.getHttpServer()).get(`${analysisRoot(world)}/${path}`).set('Authorization', `Bearer ${token}`);
}
export function analysisPost(world: AnalysisWorld, path: string, body: object, key: string = randomUUID(), token = world.financeToken): Test {
  return request(world.app!.getHttpServer()).post(`${analysisRoot(world)}/${path}`).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
}
export function analysisDefinition(world: AnalysisWorld, amountMinor: number): ExpenseDefinition {
  const fixture = world.financeFixture;
  return { description: 'Costo sintético de aceptación', counterpartyId: fixture.counterparty.id, reference: 'Evidencia sintética declarada', amountMinor, lines: [{ label: 'Costo documentado', categoryId: fixture.category.id, resourceId: fixture.resource.id, bookingId: null, amountMinor, operational: true }] };
}
export async function analysisExpense(world: AnalysisWorld, amountMinor: number, resourceId: string | null = world.financeFixture.resource.id, dueOn: string | null = '2026-10-10'): Promise<void> {
  const command = expenseCommand(world.financeFixture, amountMinor);
  const result = await analysisPost(world, 'commands', { ...command, reference: 'Evidencia sintética declarada', dueOn, lines: [{ ...command.lines[0], resourceId }] }).expect(200);
  world.anExpenseId = result.body.id as string;
  world.anLineId = (await world.financePrisma.financeExpenseLine.findFirstOrThrow({ where: { expenseId: world.anExpenseId } })).id;
}
export async function analysisCosts(world: AnalysisWorld): Promise<FinanceCostReport> {
  return (await analysisGet(world, 'v2/costs').query({ ...analysisMonth, asOf: analysisCut() }).expect(200)).body as FinanceCostReport;
}
export async function analysisCompare(world: AnalysisWorld, optIn = false): Promise<FinanceBudgetComparison> {
  return (await analysisGet(world, 'v2/budget-comparison').query({ periodMonth: '2026-09', ...(optIn ? { forecastBasis: 'ACTUAL_PLUS_PENDING_COMMITMENTS' } : {}) }).expect(200)).body as FinanceBudgetComparison;
}
export async function analysisCounts(world: AnalysisWorld): Promise<object> {
  const p = world.financePrisma;
  const [expense, settlement, movement, transfer, requestCount, audit, allocation, conversion] = await Promise.all([p.financeExpense.count(), p.financeSettlement.count(), p.financeCashMovement.count(), p.financeTransfer.count(), p.financeRequest.count(), p.financeAudit.count(), p.financeCostAllocation.count(), p.financeCommitmentConversion.count()]);
  return { expense, settlement, movement, transfer, requestCount, audit, allocation, conversion };
}
export function analysisNoFields(response: Response): void {
  for (const field of ['rows', 'items', 'lines', 'sources', 'events', 'totals', 'token', 'asOf']) assert.equal(Object.hasOwn(response.body, field), false);
}
export async function analysisCommitment(world: AnalysisWorld, amountMinor: number): Promise<void> {
  const result = await analysisPost(world, 'v2/commands', { type: 'CREATE_COMMITMENT', description: 'Compromiso sintético de septiembre', amountMinor, categoryId: world.financeFixture.category.id, resourceId: world.financeFixture.resource.id, expectedConsumptionOn: '2026-09-30', dueOn: '2026-10-10', operational: true, reference: null, reason: 'Compromiso explícito; todavía no es gasto.' }).expect(200);
  world.anCommitmentId = result.body.id as string;
}
