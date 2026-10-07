import { compareFinanceV2Budget } from './finance-v2-budget.comparison-reader';
import type { FinanceBudgetDto, FinanceCommitmentDto, FinanceCostReport, FinanceCostRow } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';

const BASIS = 'ACTUAL_PLUS_PENDING_COMMITMENTS' as const;
const CUT = '2026-10-05T12:00:00.000Z';

function budget(): FinanceBudgetDto {
  return { id: 'budget', businessId: 'biz', periodMonth: '2026-09', kind: 'OPERATING_COST', version: 3, approvedRevisionId: 'approved', revisions: [
    { id: 'approved', revisionNo: 1, lines: [{ id: 'line', ordinal: 0, categoryId: 'cat', resourceId: 'r', approvedMinor: 1000000 }], recordedByUserId: 'owner', reason: 'Meta aprobada', createdAt: '2026-09-01T00:00:00.000Z', approvedByUserId: 'owner', approvedAt: '2026-09-01T00:00:00.000Z' },
    { id: 'draft', revisionNo: 2, lines: [{ id: 'draft-line', ordinal: 0, categoryId: 'cat', resourceId: 'r', approvedMinor: 9000000 }], recordedByUserId: 'owner', reason: 'Sin aprobar', createdAt: '2026-09-02T00:00:00.000Z', approvedByUserId: null, approvedAt: null },
  ] };
}

function actual(): FinanceCostRow {
  return { source: { kind: 'EXPENSE_LINE', id: 'cost', version: 1, hash: 'hash-cost' }, expenseId: 'expense', expenseLineId: 'cost', bookingId: null, resourceId: 'r', categoryId: 'cat', consumedOn: '2026-09-15', basis: 'ACTUAL', kind: 'DIRECT', amountMinor: 800000, ruleId: null, ruleVersion: null, allocationVersion: 0, destinations: [{ resourceId: 'r', amountMinor: 800000 }], unassignedMinor: 0 };
}

function costs(): FinanceCostReport {
  return { businessId: 'biz', currency: 'PYG', timeZone: 'America/Asuncion', from: '2026-09-01', to: '2026-10-01', asOf: CUT, token: 'source-cost-token', sourceLimit: 5000, basis: 'SOURCE_COSTS', rows: [actual()], totals: { actualCostMinor: 800000, estimatedSelectedMinor: 0, ownerImputedMinor: 0, unknownSourceCount: 0 }, coverage: { missingEvidenceSourceIds: [], unknownSourceIds: [], unsupportedReasons: [] } };
}

function commitment(): FinanceCommitmentDto {
  return { id: 'commit', businessId: 'biz', description: 'Compra pendiente parcial', amountMinor: 500000, categoryId: 'cat', resourceId: 'r', expectedConsumptionOn: '2026-09-15', dueOn: '2026-10-15', operational: true, reference: null, reason: 'Plan registrado', version: 2, state: 'ACTIVE', consumedMinor: 100000, pendingMinor: 400000, recordedByUserId: 'owner', createdAt: '2026-09-03T00:00:00.000Z', conversions: [{ id: 'conversion', expenseId: 'expense', consumedMinor: 100000, recordedByUserId: 'owner', createdAt: '2026-09-15T00:00:00.000Z' }] };
}

function input() { return { budget: budget(), costs: costs(), commitments: [commitment()] }; }
function forecast() { return { ...input(), forecastBasis: BASIS }; }

describe('previsión de costos declarada por fuentes conocidas', () => {
  it('Given meta 1M, actual 800k y pendiente 400k; When opt-in; Then previsión 1.2M/desvío 200k sin alterar meta o hechos', () => {
    const source = forecast(); const before = structuredClone(source);
    const result = compareFinanceV2Budget(source);
    expect(result.lines.find(row => row.resourceId === 'r')).toEqual({ resourceId: 'r', categoryId: 'cat', approvedMinor: 1000000, actualMinor: 800000, committedPendingMinor: 400000, forecastMinor: 1200000, actualDeviationMinor: -200000, forecastDeviationMinor: 200000 });
    expect(result).toMatchObject({ forecastBasis: BASIS, approvedRevisionId: 'approved', budgetVersion: 3, asOf: CUT, estimatedSelectedMinor: 0, ownerImputedMinor: 0, coverage: { scope: 'KNOWN_OPERATING_SOURCES_ONLY', costSourceToken: 'source-cost-token', costSourceCount: 1, pendingCommitmentSourceCount: 1, sourceLimit: 5000 } });
    expect(result.scenarioToken).toMatch(/^[0-9a-f]{64}$/);
    expect(source).toEqual(before);
  });

  it.each([undefined, null])('conserva previsión nula sin opt-in (%s) y los valores actuales originales', forecastBasis => {
    const result = compareFinanceV2Budget({ ...input(), forecastBasis });
    expect(result).toMatchObject({ forecastBasis: null, scenarioToken: null });
    expect(result.lines.find(row => row.resourceId === 'r')).toMatchObject({ actualMinor: 800000, committedPendingMinor: 400000, actualDeviationMinor: -200000, forecastMinor: null, forecastDeviationMinor: null });
  });

  it('usa saldo de compromiso después de conversión, no suma otra vez su importe original', () => {
    const source = forecast(); source.commitments[0] = { ...commitment(), version: 3, consumedMinor: 300000, pendingMinor: 200000, conversions: [{ ...commitment().conversions[0], consumedMinor: 300000 }] };
    expect(compareFinanceV2Budget(source).lines.find(row => row.resourceId === 'r')).toMatchObject({ forecastMinor: 1000000, forecastDeviationMinor: 0, committedPendingMinor: 200000 });
  });

  it.each([
    { state: 'CANCELLED' as const }, { operational: false }, { expectedConsumptionOn: '2026-10-01' },
    { expectedConsumptionOn: '2026-08-31' }, { pendingMinor: 0 },
  ])('excluye compromiso cancelado/no operativo/fuera del mes/agotado: %j', override => {
    const result = compareFinanceV2Budget({ ...forecast(), commitments: [{ ...commitment(), ...override }] });
    expect(result.lines.find(row => row.resourceId === 'r')?.forecastMinor).toBe(800000);
    expect(result.coverage.pendingCommitmentSourceCount).toBe(0);
  });

  it('mes se basa en consumo esperado; vencimiento octubre no excluye consumo septiembre', () => {
    const result = compareFinanceV2Budget(forecast());
    expect(result.lines.find(row => row.resourceId === 'r')?.committedPendingMinor).toBe(400000);
  });

  it('conserva cada dimensión y residuo sin asignar; no cruza recursos o categorías', () => {
    const report = costs(); report.rows[0] = { ...actual(), kind: 'COMMON', destinations: [{ resourceId: 'r', amountMinor: 600000 }], unassignedMinor: 200000 };
    const sources = [{ ...commitment(), resourceId: 'other', categoryId: 'cat' }, { ...commitment(), id: 'unassigned', resourceId: null, categoryId: 'other-cat', pendingMinor: 250000 }];
    const result = compareFinanceV2Budget({ budget: budget(), costs: report, commitments: sources, forecastBasis: BASIS });
    expect(result.lines.find(row => row.resourceId === 'r')).toMatchObject({ forecastMinor: 600000, forecastDeviationMinor: -400000 });
    expect(result.lines.find(row => row.resourceId === 'other')).toMatchObject({ approvedMinor: null, actualMinor: 0, forecastMinor: 400000, forecastDeviationMinor: null });
    expect(result.lines.find(row => row.resourceId === null && row.categoryId === 'cat')?.forecastMinor).toBe(200000);
    expect(result.lines.find(row => row.resourceId === null && row.categoryId === 'other-cat')?.forecastMinor).toBe(250000);
  });

  it('muestra estimación laboral y trabajo propio separados sin sumarlos a la previsión', () => {
    const report = costs(); report.rows.push({ ...actual(), source: { kind: 'LABOR_ESTIMATE', id: 'labor', version: 1, hash: 'labor-hash' }, basis: 'ESTIMATE', kind: 'LABOR', amountMinor: 300000, destinations: [{ resourceId: 'r', amountMinor: 300000 }] }, { ...actual(), source: { kind: 'OWNER_IMPUTED', id: 'owner', version: 1, hash: 'owner-hash' }, basis: 'ESTIMATE', kind: 'OWNER_WORK', amountMinor: 250000, destinations: [{ resourceId: 'r', amountMinor: 250000 }] });
    report.totals.estimatedSelectedMinor = 300000; report.totals.ownerImputedMinor = 250000;
    const result = compareFinanceV2Budget({ ...forecast(), costs: report });
    expect(result).toMatchObject({ estimatedSelectedMinor: 300000, ownerImputedMinor: 250000 });
    expect(result.lines.find(row => row.resourceId === 'r')?.forecastMinor).toBe(1200000);
  });

  it('declara fuentes desconocidas/evidencia faltante; el total conocido no promete cobertura futura completa', () => {
    const report = costs(); report.coverage = { unknownSourceIds: ['labor-unknown'], missingEvidenceSourceIds: ['expense-without-proof'], unsupportedReasons: ['SIN_CRITERIO'] };
    const result = compareFinanceV2Budget({ ...forecast(), costs: report });
    expect(result.coverage).toMatchObject({ scope: 'KNOWN_OPERATING_SOURCES_ONLY', unknownCostSourceIds: ['labor-unknown'], missingEvidenceSourceIds: ['expense-without-proof'], unsupportedReasons: ['SIN_CRITERIO'] });
    expect(result.lines.find(row => row.resourceId === 'r')?.forecastMinor).toBe(1200000);
  });

  it('sin revisión aprobada conserva previsión conocida pero desviación/base desconocidas', () => {
    const source = forecast(); source.budget.approvedRevisionId = null;
    const result = compareFinanceV2Budget(source);
    expect(result.lines.every(row => row.approvedMinor === null && row.actualDeviationMinor === null && row.forecastDeviationMinor === null)).toBe(true);
    expect(result.lines.find(row => row.resourceId === 'r')?.forecastMinor).toBe(1200000);
  });

  it('token de fuentes no cambia con asOf; escenario sí identifica corte y base exactos', () => {
    const first = compareFinanceV2Budget(forecast());
    const later = compareFinanceV2Budget({ ...forecast(), costs: { ...costs(), asOf: '2026-10-05T12:01:00.000Z' } });
    expect(later.token).toBe(first.token); expect(later.scenarioToken).not.toBe(first.scenarioToken);
    expect(compareFinanceV2Budget(input()).token).toBe(first.token);
    expect(compareFinanceV2Budget(forecast())).toEqual(first);
  });

  it('versiones/importes actuales de compromiso y costo alteran token de fuentes y de escenario', () => {
    const first = compareFinanceV2Budget(forecast());
    const changed = compareFinanceV2Budget({ ...forecast(), commitments: [{ ...commitment(), version: 3, consumedMinor: 100001, pendingMinor: 399999, conversions: [{ ...commitment().conversions[0], consumedMinor: 100001 }] }], costs: { ...costs(), token: 'source-changed' } });
    expect(changed.token).not.toBe(first.token); expect(changed.scenarioToken).not.toBe(first.scenarioToken);
    expect(changed.lines.find(row => row.resourceId === 'r')?.forecastMinor).toBe(1199999);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN])('rechaza importe pendiente inválido %s', pendingMinor => {
    expect(() => compareFinanceV2Budget({ ...forecast(), commitments: [{ ...commitment(), pendingMinor }] })).toThrow(FinanceInputError);
  });

  it('rechaza overflow de la suma prevista aunque cada fuente sea segura; sin opt-in el real sigue válido', () => {
    const report = costs(); report.rows[0].destinations[0].amountMinor = Number.MAX_SAFE_INTEGER; report.rows[0].amountMinor = Number.MAX_SAFE_INTEGER; report.totals.actualCostMinor = Number.MAX_SAFE_INTEGER;
    const source = { ...input(), costs: report, commitments: [{ ...commitment(), pendingMinor: 1 }] };
    expect(compareFinanceV2Budget(source).lines.find(row => row.resourceId === 'r')?.actualMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => compareFinanceV2Budget({ ...source, forecastBasis: BASIS })).toThrow(FinanceInputError);
  });

  it.each(['budget', 'commitment'])('falla cerrado frente a fuente de otro negocio: %s', type => {
    const source = forecast(); if (type === 'budget') source.budget.businessId = 'other'; else source.commitments[0].businessId = 'other';
    expect(() => compareFinanceV2Budget(source)).toThrow(FinanceConflictError);
  });

  it('rechaza costos de otro rango; ninguna consulta parcial se presenta como mes completo', () => {
    expect(() => compareFinanceV2Budget({ ...forecast(), costs: { ...costs(), from: '2026-09-02' } })).toThrow(FinanceConflictError);
  });

  it.each(['costs', 'commitments'])('rechaza 5001 fuentes de %s sin truncar', kind => {
    const source = forecast(); if (kind === 'costs') source.costs.rows = Array.from({ length: 5001 }, actual); else source.commitments = Array.from({ length: 5001 }, commitment);
    expect(() => compareFinanceV2Budget(source)).toThrow(FinanceConflictError);
  });

  it('aplica límite combinado: 3000 costos + 2001 compromisos no son un corte parcial válido', () => {
    const source = forecast(); source.costs.rows = Array.from({ length: 3000 }, actual); source.commitments = Array.from({ length: 2001 }, commitment);
    expect(() => compareFinanceV2Budget(source)).toThrow(FinanceConflictError);
  });
});
