import { FinanceCloseUseCase, type CloseMutation, type CloseTransactionScope } from './finance-close.use-cases';
import { FINANCE_CLOSE_WRITERS } from '../domain/finance-close.rules';
import type { FinanceCloseSources, FinancePeriod } from '../domain/finance-close.types';

const period = (): FinancePeriod => ({ id: 'period', businessId: 'business', from: '2026-09-01', to: '2026-10-01', timeZone: 'America/Asuncion', status: 'OPEN', version: 1, latestSnapshotId: null });
const input = (): CloseMutation => ({ businessId: 'business', actorUserId: 'owner', periodId: 'period', expectedVersion: 1, reason: 'Cierre manual.', idempotencyKey: 'request-1234567890', fingerprint: 'fingerprint', expectedSourceToken: 'token', operation: 'CLOSE' });
const sources = (): FinanceCloseSources => ({ businessId: 'business', from: '2026-09-01', to: '2026-10-01', timeZone: 'America/Asuncion', asOf: '2026-10-05T10:00:00.000Z', sourceToken: 'token', payloadHash: 'hash', policyVersions: { recognition: 'NIGHT_SERVICE_V1' }, payload: { income: 100 }, sourceRefs: [], guardedWriters: FINANCE_CLOSE_WRITERS, checklist: ['SOURCES_COMPLETE', 'COMMON_CUT', 'PYG_SAFE', 'COST_CONSERVATION', 'RECOGNITION_COVERAGE', 'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS'].map(key => ({ key, passed: true, severity: 'BLOCKER', acknowledgement: null })) });
function fixture() {
  const events: string[] = [];
  const scope = {
    authorizeOwner: jest.fn<ReturnType<CloseTransactionScope['authorizeOwner']>, Parameters<CloseTransactionScope['authorizeOwner']>>(() => { events.push('authorize'); return Promise.resolve(); }),
    readRequest: jest.fn<ReturnType<CloseTransactionScope['readRequest']>, Parameters<CloseTransactionScope['readRequest']>>(() => { events.push('request'); return Promise.resolve(null); }),
    lockPeriod: jest.fn<ReturnType<CloseTransactionScope['lockPeriod']>, Parameters<CloseTransactionScope['lockPeriod']>>(() => { events.push('lock'); return Promise.resolve(period()); }),
    localToday: jest.fn<ReturnType<CloseTransactionScope['localToday']>, Parameters<CloseTransactionScope['localToday']>>(() => { events.push('today'); return Promise.resolve('2026-10-05'); }),
    readCompleteSources: jest.fn<ReturnType<CloseTransactionScope['readCompleteSources']>, Parameters<CloseTransactionScope['readCompleteSources']>>(() => { events.push('sources'); return Promise.resolve(sources()); }),
    appendAndComparePeriod: jest.fn<ReturnType<CloseTransactionScope['appendAndComparePeriod']>, Parameters<CloseTransactionScope['appendAndComparePeriod']>>(() => { events.push('save'); return Promise.resolve(); }),
  };
  let serial = 0;
  const executeCall = jest.fn();
  async function execute<T>(work: (transaction: CloseTransactionScope) => Promise<T>): Promise<T> { executeCall(); return work(scope); }
  const service = new FinanceCloseUseCase({ execute }, { now: () => '2026-10-05T10:01:00.000Z' }, { next: () => `id-${serial += 1}` });
  return { service, scope, events, execute: executeCall };
}
describe('Aplicación FIN-029', () => {
  it('toma guardia común antes de fuentes y confirma un único resultado transaccional', async () => {
    const test = fixture(); const result = await test.service.execute(input());
    expect(test.events).toEqual(['authorize', 'request', 'lock', 'sources', 'today', 'save']); expect(test.execute).toHaveBeenCalledTimes(1);
    expect(result.period.status).toBe('CLOSED'); expect(result.snapshot?.sourceToken).toBe('token');
  });
  it('actor sin OWNER nunca adquiere período ni fuentes', async () => {
    const test = fixture(); jest.mocked(test.scope.authorizeOwner).mockRejectedValueOnce(new Error('OWNER requerido'));
    await expect(test.service.execute(input())).rejects.toThrow('OWNER'); expect(test.scope.lockPeriod).not.toHaveBeenCalled();
  });
  it('retry exacto conserva snapshot y fingerprint distinto se rechaza', async () => {
    const test = fixture(); const result = await test.service.execute(input());
    jest.mocked(test.scope.readRequest).mockResolvedValueOnce({ fingerprint: 'fingerprint', result });
    expect(await test.service.execute(input())).toEqual(result); expect(test.scope.appendAndComparePeriod).toHaveBeenCalledTimes(1);
    jest.mocked(test.scope.readRequest).mockResolvedValueOnce({ fingerprint: 'distinto', result });
    await expect(test.service.execute(input())).rejects.toThrow('otra intención');
  });
  it('fuente fallida/token obsoleto o período ajeno no persiste snapshot parcial', async () => {
    const test = fixture(); jest.mocked(test.scope.readCompleteSources).mockRejectedValueOnce(new Error('Fuente incompleta'));
    await expect(test.service.execute(input())).rejects.toThrow('incompleta'); expect(test.scope.appendAndComparePeriod).not.toHaveBeenCalled();
    await expect(test.service.execute({ ...input(), expectedSourceToken: 'viejo' })).rejects.toThrow('token');
    jest.mocked(test.scope.lockPeriod).mockResolvedValueOnce({ ...period(), businessId: 'otro' });
    await expect(test.service.execute(input())).rejects.toThrow('Negocio'); expect(test.scope.appendAndComparePeriod).not.toHaveBeenCalled();
  });
  it('reapertura añade evento sin volver a leer fuentes ni modificar snapshot', async () => {
    const test = fixture(); jest.mocked(test.scope.lockPeriod).mockResolvedValueOnce({ ...period(), status: 'CLOSED', version: 2, latestSnapshotId: 'snapshot' });
    const result = await test.service.execute({ ...input(), operation: 'REOPEN', expectedVersion: 2 });
    expect(result.snapshot).toBeNull(); expect(result.event.snapshotId).toBe('snapshot'); expect(result.period.status).toBe('OPEN');
    expect(test.scope.readCompleteSources).not.toHaveBeenCalled();
  });
});
