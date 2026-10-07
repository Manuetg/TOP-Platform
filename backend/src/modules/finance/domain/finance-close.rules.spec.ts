import { assertFinanceWriteOpen, FINANCE_CLOSE_WRITERS, planFinanceClose, planFinanceReopen } from './finance-close.rules';
import type { FinanceCloseSources, FinancePeriod } from './finance-close.types';

const period = (): FinancePeriod => ({ id: 'period', businessId: 'business', from: '2026-09-01', to: '2026-10-01', timeZone: 'America/Asuncion', status: 'OPEN', version: 1, latestSnapshotId: null });
const sources = (): FinanceCloseSources => ({ businessId: 'business', from: '2026-09-01', to: '2026-10-01', timeZone: 'America/Asuncion', asOf: '2026-10-05T10:00:00.000Z', sourceToken: 'token', payloadHash: 'hash', policyVersions: { recognition: 'NIGHT_SERVICE_V1' }, payload: { income: 300, costs: 101, pendingCoverage: [] }, sourceRefs: [{ type: 'SERVICE_PRICING', id: 'snapshot', version: '0' }], guardedWriters: FINANCE_CLOSE_WRITERS, checklist: ['SOURCES_COMPLETE', 'COMMON_CUT', 'PYG_SAFE', 'COST_CONSERVATION', 'RECOGNITION_COVERAGE', 'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS'].map(key => ({ key, passed: true, severity: 'BLOCKER', acknowledgement: null })) });
const close = (source = sources(), current = period()) => planFinanceClose({ id: current.latestSnapshotId ? 'snapshot-close-next' : 'snapshot-close', eventId: 'event', period: current, expectedVersion: current.version, expectedSourceToken: 'token', sources: source, localToday: '2026-10-05', actorUserId: 'owner', recordedAt: '2026-10-05T10:01:00.000Z', reason: 'Cierre revisado.' });

describe('FIN-029 snapshot, guardias y reapertura', () => {
  it('crea snapshot inmutable con payload independiente de fuentes y período versionado', () => {
    const source = sources(); const result = close(source);
    (source.payload as Record<string, number>).income = 999;
    expect((result.snapshot.payload as Record<string, number>).income).toBe(300);
    expect(Object.isFrozen(result.snapshot.payload)).toBe(true); expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(result.period).toMatchObject({ status: 'CLOSED', version: 2, latestSnapshotId: 'snapshot-close' });
  });
  it('no cierra hasta que todos los escritores estén protegidos', () => { expect(() => close({ ...sources(), guardedWriters: FINANCE_CLOSE_WRITERS.filter(writer => writer !== 'PAYMENT_REGISTER') })).toThrow('todos los escritores'); });
  it('bloquea error de integridad aunque intenten degradarlo a excepción', () => {
    const source = sources(); source.checklist = source.checklist.map(item => item.key === 'COST_CONSERVATION' ? { ...item, passed: false, severity: 'EXCEPTION', acknowledgement: 'Aceptado.' } : item);
    expect(() => close(source)).toThrow('siempre son bloqueantes');
  });
  it('permite excepción de evidencia sólo con aceptación explícita de OWNER', () => {
    const source = sources(); source.checklist = source.checklist.map(item => item.key === 'EVIDENCE' ? { ...item, passed: false, severity: 'EXCEPTION', acknowledgement: 'Referencias manuales revisadas.' } : item);
    expect(close(source).snapshot.checklist.find(item => item.key === 'EVIDENCE')?.passed).toBe(false);
    source.checklist = source.checklist.map(item => ({ ...item, acknowledgement: null })); expect(() => close(source)).toThrow('texto explícito');
  });
  it('rechaza período no mensual/no terminado, fuente cross-tenant y token obsoleto', () => {
    expect(() => close(sources(), { ...period(), from: '2026-09-02' })).toThrow('mes local');
    expect(() => close(sources(), { ...period(), from: '2026-10-01', to: '2026-11-01' })).toThrow('terminó');
    expect(() => close({ ...sources(), businessId: 'otro' })).toThrow('Negocio');
    expect(() => close({ ...sources(), sourceToken: 'obsoleto' })).toThrow('token');
  });
  it.each(FINANCE_CLOSE_WRITERS)('bloquea %s para fecha cerrada', writer => {
    expect(() => assertFinanceWriteOpen({ businessId: 'business', writer, affectedDates: ['2026-09-30'], changedSourceRefs: [], complete: true }, [{ period: close().period, sourceRefs: sources().sourceRefs }])).toThrow('período cerrado');
  });
  it('una revisión creada hoy no elude cierre de la fuente original', () => {
    expect(() => assertFinanceWriteOpen({ businessId: 'business', writer: 'PRICING_SERVICE_REVISION', affectedDates: ['2026-10-05'], changedSourceRefs: [{ type: 'SERVICE_PRICING', id: 'snapshot' }], complete: true }, [{ period: close().period, sourceRefs: sources().sourceRefs }])).toThrow('período cerrado');
  });
  it('permite nueva liquidación abierta sin reescribir costo anterior', () => {
    expect(() => assertFinanceWriteOpen({ businessId: 'business', writer: 'SETTLEMENT', affectedDates: ['2026-10-05'], changedSourceRefs: [], complete: true }, [{ period: close().period, sourceRefs: sources().sourceRefs }])).not.toThrow();
  });
  it('reapertura exige motivo/CAS y recierre enlaza snapshot previo intacto', () => {
    const first = close();
    expect(() => planFinanceReopen({ eventId: 'reopen', period: first.period, expectedVersion: 1, actorUserId: 'owner', recordedAt: '2026-10-05T11:00:00.000Z', reason: 'Corrección.' })).toThrow('versión vigente');
    expect(() => planFinanceReopen({ eventId: 'reopen', period: first.period, expectedVersion: 2, actorUserId: 'owner', recordedAt: '2026-10-05T11:00:00.000Z', reason: '' })).toThrow('texto explícito');
    const reopened = planFinanceReopen({ eventId: 'reopen', period: first.period, expectedVersion: 2, actorUserId: 'owner', recordedAt: '2026-10-05T11:00:00.000Z', reason: 'Corrección.' });
    const second = close(sources(), reopened.period);
    expect(second.snapshot.previousSnapshotId).toBe(first.snapshot.id); expect(second.snapshot.closeVersion).toBe(4); expect(first.snapshot.closeVersion).toBe(2);
  });
  it('impacto incompleto, writer desconocido o payload inseguro falla cerrado', () => {
    expect(() => assertFinanceWriteOpen({ businessId: 'business', writer: 'UNKNOWN', affectedDates: [], changedSourceRefs: [], complete: true }, [])).toThrow('todo el impacto');
    expect(() => close({ ...sources(), payload: { amount: Number.MAX_SAFE_INTEGER + 1 } })).toThrow('inseguros');
  });
});
