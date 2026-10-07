import { CertifyServiceUseCase, type RecognitionMutation, type RecognitionTransactionScope } from './finance-recognition.use-cases';
import type { RecognitionContext } from '../domain/finance-recognition.types';

const input = (): RecognitionMutation => ({ businessId: 'business', actorUserId: 'owner', idempotencyKey: 'request-1234567890', fingerprint: 'fingerprint', command: { bookingId: 'booking', expectedBookingUpdatedAt: '2026-10-05T09:00:00.000Z', expectedCertificateVersion: 0, expectedPricingSourceId: 'pricing', servedNights: ['2026-10-03'], effectiveCheckInOn: '2026-10-03', effectiveCheckOutOn: null, evidence: 'Estadía revisada.', reason: 'Certificación.', supersedesCertificateId: null } });
const context = (): RecognitionContext => ({ localToday: '2026-10-05', booking: { businessId: 'business', bookingId: 'booking', bookingUpdatedAt: '2026-10-05T09:00:00.000Z', resourceIds: ['resource'], checkInDate: '2026-10-03', checkOutDate: '2026-10-04', status: 'IN_PROGRESS', checkInEventId: 'in', checkOutEventId: null }, pricing: { businessId: 'business', bookingId: 'booking', resourceId: 'resource', originalSnapshotId: 'pricing', sourceId: 'pricing', serviceRevisionId: null, revisionNumber: 0, sourceHash: 'price-hash', currency: 'PYG', checkInDate: '2026-10-03', checkOutDate: '2026-10-04', mode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 100, totalAmountMinor: 100, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Acordado.', nights: 1, breakdown: [] } });
function fixture() {
  const events: string[] = [];
  const scope = {
    authorizeOwner: jest.fn<ReturnType<RecognitionTransactionScope['authorizeOwner']>, Parameters<RecognitionTransactionScope['authorizeOwner']>>(() => { events.push('authorize'); return Promise.resolve(); }),
    readRequest: jest.fn<ReturnType<RecognitionTransactionScope['readRequest']>, Parameters<RecognitionTransactionScope['readRequest']>>(() => { events.push('request'); return Promise.resolve(null); }),
    lockSources: jest.fn<ReturnType<RecognitionTransactionScope['lockSources']>, Parameters<RecognitionTransactionScope['lockSources']>>(() => { events.push('lock'); return Promise.resolve(); }),
    readLockedContext: jest.fn<ReturnType<RecognitionTransactionScope['readLockedContext']>, Parameters<RecognitionTransactionScope['readLockedContext']>>(() => { events.push('context'); return Promise.resolve(context()); }),
    readHead: jest.fn<ReturnType<RecognitionTransactionScope['readHead']>, Parameters<RecognitionTransactionScope['readHead']>>(() => { events.push('head'); return Promise.resolve(null); }),
    assertOpenImpact: jest.fn<ReturnType<RecognitionTransactionScope['assertOpenImpact']>, Parameters<RecognitionTransactionScope['assertOpenImpact']>>(() => { events.push('guard'); return Promise.resolve(); }),
    appendAndCompareHead: jest.fn<ReturnType<RecognitionTransactionScope['appendAndCompareHead']>, Parameters<RecognitionTransactionScope['appendAndCompareHead']>>(() => { events.push('save'); return Promise.resolve(); }),
    appendAuditAndRequest: jest.fn<ReturnType<RecognitionTransactionScope['appendAuditAndRequest']>, Parameters<RecognitionTransactionScope['appendAuditAndRequest']>>(() => { events.push('audit-request'); return Promise.resolve(); }),
  };
  const executeCall = jest.fn();
  async function execute<T>(work: (transaction: RecognitionTransactionScope) => Promise<T>): Promise<T> { executeCall(); return work(scope); }
  let serial = 0;
  const service = new CertifyServiceUseCase({ execute }, { now: () => '2026-10-05T10:00:00.000Z' }, { next: () => `certificate-${serial += 1}` });
  return { service, scope, events, execute: executeCall };
}
describe('Aplicación FIN-021', () => {
  it('serializa guardia/fuentes antes de CAS y audit/request dentro de una transacción', async () => {
    const test = fixture(); const result = await test.service.execute(input());
    expect(test.events).toEqual(['authorize', 'request', 'lock', 'context', 'head', 'guard', 'save', 'audit-request']);
    expect(test.execute).toHaveBeenCalledTimes(1); expect(result.units[0].amountMinor).toBe(100);
  });
  it('rechaza actor sin OWNER antes de leer fuente o escribir', async () => {
    const test = fixture(); jest.mocked(test.scope.authorizeOwner).mockRejectedValueOnce(new Error('OWNER requerido'));
    await expect(test.service.execute(input())).rejects.toThrow('OWNER'); expect(test.scope.readRequest).not.toHaveBeenCalled(); expect(test.scope.appendAndCompareHead).not.toHaveBeenCalled();
  });
  it('retry exacto no recertifica, no toma nueva fuente y devuelve copia', async () => {
    const test = fixture(); const certificate = await test.service.execute(input());
    jest.mocked(test.scope.readRequest).mockResolvedValueOnce({ fingerprint: 'fingerprint', certificate });
    const result = await test.service.execute(input()); expect(result).toEqual(certificate); expect(result).not.toBe(certificate);
    expect(test.scope.appendAndCompareHead).toHaveBeenCalledTimes(1);
  });
  it('clave repetida con otra intención no guarda', async () => {
    const test = fixture(); const certificate = await test.service.execute(input());
    jest.mocked(test.scope.readRequest).mockResolvedValueOnce({ fingerprint: 'otra-intención', certificate });
    await expect(test.service.execute(input())).rejects.toThrow('otra intención'); expect(test.scope.appendAndCompareHead).toHaveBeenCalledTimes(1);
  });
  it('cierre concurrente o CAS fallido no llega a audit/request de éxito', async () => {
    const test = fixture(); jest.mocked(test.scope.assertOpenImpact).mockRejectedValueOnce(new Error('Período cerrado'));
    await expect(test.service.execute(input())).rejects.toThrow('cerrado'); expect(test.scope.appendAndCompareHead).not.toHaveBeenCalled(); expect(test.scope.appendAuditAndRequest).not.toHaveBeenCalled();
    jest.mocked(test.scope.appendAndCompareHead).mockRejectedValueOnce(new Error('CAS obsoleto'));
    await expect(test.service.execute(input())).rejects.toThrow('CAS'); expect(test.scope.appendAuditAndRequest).not.toHaveBeenCalled();
  });
  it('corrección pasa impacto de todas las noches antiguas y nuevas a guardia', async () => {
    const test = fixture(); const first = await test.service.execute(input());
    jest.mocked(test.scope.readHead).mockResolvedValueOnce({ id: first.id, version: 1, certificate: first });
    const updated = input(); updated.command.expectedCertificateVersion = 1; updated.command.supersedesCertificateId = first.id; updated.command.servedNights = [];
    await test.service.execute(updated);
    const calls = jest.mocked(test.scope.assertOpenImpact).mock.calls;
    expect(calls[1][1]).toEqual(first); expect(calls[1][2].units).toEqual([]);
  });
});
