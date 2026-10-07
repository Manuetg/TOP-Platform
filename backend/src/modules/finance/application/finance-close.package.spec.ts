import { buildFinanceClosePackage } from './finance-close.package';
import type { CloseJson, FinanceCloseSnapshot } from '../domain/finance-close.types';

function fixture(): FinanceCloseSnapshot {
  return { id: 'snapshot', businessId: 'tenant', periodId: 'period', closeVersion: 2, previousSnapshotId: null, asOf: '2026-10-05T12:00:00.000Z', sourceToken: 'source-token', policyVersion: 'BLOCK_CLOSED_PERIOD_V1', policyVersions: {}, payloadHash: 'hash-already-verified-by-read-adapter', sourceRefs: [], recordedByUserId: 'owner', recordedAt: '2026-10-05T12:00:01.000Z', checklist: [{ key: 'EVIDENCE', passed: false, severity: 'EXCEPTION', acknowledgement: 'Documentación revisada fuera del sistema.' }], payload: { debtBasis: 'OBSERVED_AT_AS_OF', unknownHistoricalDebt: true, registeredOperations: { balanceSources: [{ sourceId: 'cash-before-month', sourceVersion: 1, occurredAt: '2026-08-31T12:00:00.000Z', amountMinor: -5, includedInBalance: true, description: '=HYPERLINK("private")' }, { sourceId: 'cash-after-month', sourceVersion: 1, occurredAt: '2026-10-01T12:00:00.000Z', amountMinor: 50, includedInBalance: true, description: 'Futuro.' }] }, profitability: { from: '2026-09-01', to: '2026-10-01', timeZone: 'Etc/UTC', units: [{ localNight: '2026-09-01', bookingId: 'booking', resourceId: 'resource', certificateId: 'certificate', certificateVersion: 1, amountMinor: 30 }], terminalEntries: [{ id: 'terminal', version: 1, bookingId: 'booking', resourceId: null, recognitionOn: '2026-09-01', amountMinor: 10, stale: false, classification: 'Partida confirmada, no servicio.' }], costSources: [{ sourceId: 'EXPENSE_LINE:line', sourceVersion: 1, consumedOn: '2026-09-01', operational: true, basis: 'ACTUAL', allocations: [{ resourceId: 'resource', amountMinor: 12 }, { resourceId: null, amountMinor: 8 }] }], ownerWorkSources: [{ sourceId: 'OWNER_IMPUTED:revision', sourceVersion: 1, consumedOn: '2026-09-01', operational: true, basis: 'ESTIMATE', allocations: [{ resourceId: null, amountMinor: 5 }] }], coverage: { complete: false, pendingByReason: { COST_EVIDENCE_MISSING: 2 } } } } };
}
function parts(snapshot: FinanceCloseSnapshot) {
  const payload = snapshot.payload as { [key: string]: CloseJson }; const profitability = payload.profitability as { [key: string]: CloseJson };
  return { payload, profitability };
}
describe('Paquete contador de snapshot guardado; bases, CSV y alertas', () => {
  it('reproduce snapshot/version/corte y separa costo asignado, trabajo propio y saldo registrado', () => {
    const saved = fixture(); const before = structuredClone(saved); const result = buildFinanceClosePackage(saved);
    expect(result.snapshot).toBe(saved); expect(saved).toEqual(before); expect(result.period).toEqual({ from: '2026-09-01', to: '2026-10-01', timeZone: 'Etc/UTC' });
    expect(result.detailsCsv.match(/OPERATING_COST/g)).toHaveLength(2); expect(result.detailsCsv.match(/OWNER_WORK_ESTIMATE/g)).toHaveLength(1); expect(result.detailsCsv).toContain('"CERTIFIED_SERVICE"'); expect(result.detailsCsv).toContain('"CONFIRMED_NON_SERVICE"');
    expect(result.debtBasis).toBe('OBSERVED_AT_AS_OF'); expect(result.unknownHistoricalDebt).toBe(true);
  });
  it('saldo incluye antecedentes necesarios, excluye caja futura y escapa fórmulas/comillas', () => {
    const result = buildFinanceClosePackage(fixture()); expect(result.detailsCsv).toContain('cash-before-month'); expect(result.detailsCsv).not.toContain('cash-after-month');
    expect(result.detailsCsv).toContain('"\'=HYPERLINK(""private"")"'); expect(result.detailsCsv).toContain('"-5"');
  });
  it('detalle mensual excluye fechas futuras aunque el JSON guardado conserva contexto completo', () => {
    const saved = fixture(); const { profitability } = parts(saved); (profitability.units as CloseJson[]).push({ localNight: '2026-10-01', bookingId: 'future', resourceId: 'r', certificateId: 'future-cert', certificateVersion: 1, amountMinor: 999 });
    const result = buildFinanceClosePackage(saved); expect(result.detailsCsv).not.toContain('future-cert'); expect(JSON.stringify(result.snapshot.payload)).toContain('future-cert');
  });
  it('alertas conservan causa, cantidad y acknowledgement firmado en el cierre', () => {
    expect(buildFinanceClosePackage(fixture()).alerts).toEqual([{ code: 'CHECKLIST:EVIDENCE', count: 1, acknowledgement: 'Documentación revisada fuera del sistema.' }, { code: 'RECOGNITION:COST_EVIDENCE_MISSING', count: 2, acknowledgement: null }]);
  });
  it('fuentes ausentes o importes inseguros fallan completo sin CSV parcial', () => {
    const saved = fixture(); const { profitability } = parts(saved); delete profitability.units;
    expect(() => buildFinanceClosePackage(saved)).toThrow('lista completa');
    const unsafe = fixture(); const array = parts(unsafe).profitability.units as { [key: string]: CloseJson }[]; array[0].amountMinor = Number.MAX_SAFE_INTEGER + 1;
    expect(() => buildFinanceClosePackage(unsafe)).toThrow('PYG entero seguro');
  });
});
