import { compareFinanceV2Budget } from './finance-v2-budget.comparison-reader';
import type { FinanceBudgetDto, FinanceCommitmentDto, FinanceCostReport, FinanceCostRow } from '../domain/finance-v2.types';
import { FinanceConflictError } from '../domain/finance.errors';

const CUT = '2026-10-05T09:00:00.000Z';
const BASIS = 'ACTUAL_PLUS_PENDING_COMMITMENTS' as const;

function budget(): FinanceBudgetDto {
  return {
    id: 'budget', businessId: 'biz', periodMonth: '2026-09', kind: 'OPERATING_COST', version: 2, approvedRevisionId: 'approved',
    revisions: [{ id: 'approved', revisionNo: 1, lines: Array.from({ length: 200 }, (_, index) => ({ id: `budget-line-${index}`, ordinal: index, categoryId: 'budget-category', resourceId: `budget-resource-${index}`, approvedMinor: 1000 })), recordedByUserId: 'owner', reason: 'Meta aprobada con 200 líneas.', createdAt: CUT, approvedByUserId: 'owner', approvedAt: CUT }],
  };
}

function actual(): FinanceCostRow {
  return {
    source: { kind: 'EXPENSE_LINE', id: 'cost', version: 1, hash: 'cost-hash' }, expenseId: 'expense', expenseLineId: 'cost', bookingId: null, resourceId: null, categoryId: 'cost-category', consumedOn: '2026-09-15', basis: 'ACTUAL', kind: 'COMMON', amountMinor: 401,
    ruleId: 'rule', ruleVersion: 1, allocationVersion: 1, destinations: Array.from({ length: 200 }, (_, index) => ({ resourceId: `cost-resource-${index}`, amountMinor: 2 })), unassignedMinor: 1,
  };
}

function costs(): FinanceCostReport {
  return {
    businessId: 'biz', currency: 'PYG', timeZone: 'America/Asuncion', from: '2026-09-01', to: '2026-10-01', asOf: CUT, token: 'cost-token', sourceLimit: 5000, basis: 'SOURCE_COSTS', rows: [actual()],
    totals: { actualCostMinor: 401, estimatedSelectedMinor: 0, ownerImputedMinor: 0, unknownSourceCount: 0 }, coverage: { missingEvidenceSourceIds: [], unknownSourceIds: [], unsupportedReasons: [] },
  };
}

function commitment(index: number): FinanceCommitmentDto {
  return {
    id: `commitment-${index}`, businessId: 'biz', description: 'Compra operativa pendiente.', amountMinor: 3, categoryId: 'commitment-category', resourceId: `commitment-resource-${index}`, expectedConsumptionOn: '2026-09-15', dueOn: null, operational: true, reference: null, reason: 'Compromiso del mes.',
    version: 1, state: 'ACTIVE', consumedMinor: 0, pendingMinor: 3, recordedByUserId: 'owner', createdAt: CUT, conversions: [],
  };
}

function input(commitmentCount: number) {
  return { budget: budget(), costs: costs(), commitments: Array.from({ length: commitmentCount }, (_, index) => commitment(index)), forecastBasis: BASIS };
}

describe('comparación presupuestaria acota dimensiones sin truncar fuentes ni importes', () => {
  it('Given 4751 fuentes, 200 metas y 200 destinos; When producen 5151 dimensiones; Then conflicto explícito', () => {
    const source = input(4750);
    expect(source.costs.rows.length + source.commitments.length).toBe(4751);
    expect(source.budget.revisions[0].lines).toHaveLength(200);
    expect(source.costs.rows[0].destinations).toHaveLength(200);
    expect(() => compareFinanceV2Budget(source)).toThrow(FinanceConflictError);
    expect(() => compareFinanceV2Budget(source)).toThrow('La comparación supera 5000 dimensiones; no se trunca.');
  });

  it('exactamente 5000 dimensiones conserva metas, destinos, sin asignar y cada pendiente', () => {
    const result = compareFinanceV2Budget(input(4599));
    expect(result.lines).toHaveLength(5000);
    expect(result.coverage).toMatchObject({ costSourceCount: 1, pendingCommitmentSourceCount: 4599, sourceLimit: 5000 });
    expect(result.lines.reduce((total, line) => total + (line.approvedMinor ?? 0), 0)).toBe(200000);
    expect(result.lines.reduce((total, line) => total + line.actualMinor, 0)).toBe(401);
    expect(result.lines.reduce((total, line) => total + line.committedPendingMinor, 0)).toBe(13797);
    expect(result.lines.reduce((total, line) => total + (line.forecastMinor ?? 0), 0)).toBe(14198);
    expect(result.lines.find(line => line.categoryId === 'cost-category' && line.resourceId === null)).toMatchObject({ actualMinor: 1, forecastMinor: 1 });
  });

  it('rechaza la dimensión 5001 sin modificar los datos recibidos', () => {
    const source = input(4600), before = structuredClone(source);
    expect(() => compareFinanceV2Budget(source)).toThrow('5000 dimensiones');
    expect(source).toEqual(before);
  });

  it('una dimensión repetida al límite suma sus fuentes y conserva el total sin crear una línea extra', () => {
    const source = input(4599);
    source.commitments.push({ ...commitment(0), id: 'another-commitment', amountMinor: 7, pendingMinor: 7 });
    source.costs.rows.push({ ...actual(), source: { kind: 'EXPENSE_LINE', id: 'another-cost', version: 1, hash: 'another-hash' }, expenseLineId: 'another-cost', amountMinor: 11, destinations: [{ resourceId: 'cost-resource-0', amountMinor: 11 }], unassignedMinor: null });
    source.costs.totals.actualCostMinor = 412;
    const result = compareFinanceV2Budget(source);
    expect(result.lines).toHaveLength(5000);
    expect(result.coverage).toMatchObject({ costSourceCount: 2, pendingCommitmentSourceCount: 4600 });
    expect(result.lines.find(line => line.resourceId === 'cost-resource-0')?.actualMinor).toBe(13);
    expect(result.lines.find(line => line.resourceId === 'commitment-resource-0')?.committedPendingMinor).toBe(10);
    expect(result.lines.reduce((total, line) => total + line.actualMinor, 0)).toBe(412);
    expect(result.lines.reduce((total, line) => total + line.committedPendingMinor, 0)).toBe(13804);
    expect(result.lines.reduce((total, line) => total + (line.forecastMinor ?? 0), 0)).toBe(14216);
  });

  it('el límite existente de 5000 fuentes sigue vigente aunque todas compartan dimensión', () => {
    const source = input(5000);
    source.commitments = source.commitments.map(row => ({ ...row, resourceId: 'cost-resource-0', categoryId: 'cost-category' }));
    expect(() => compareFinanceV2Budget(source)).toThrow('La comparación supera 5000 fuentes; no se trunca.');
  });

  it('exactamente 5000 fuentes con dimensiones repetidas devuelve todas sus contribuciones', () => {
    const source = input(4999);
    source.commitments = source.commitments.map(row => ({ ...row, resourceId: 'cost-resource-0', categoryId: 'cost-category' }));
    const result = compareFinanceV2Budget(source);
    expect(result.lines).toHaveLength(401);
    expect(result.coverage).toMatchObject({ costSourceCount: 1, pendingCommitmentSourceCount: 4999 });
    expect(result.lines.find(line => line.resourceId === 'cost-resource-0')).toMatchObject({ actualMinor: 2, committedPendingMinor: 14997, forecastMinor: 14999 });
    expect(result.lines.reduce((total, line) => total + (line.forecastMinor ?? 0), 0)).toBe(15398);
  });
});
