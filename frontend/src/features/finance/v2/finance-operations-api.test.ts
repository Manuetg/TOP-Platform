import { afterEach, expect, it, vi } from 'vitest';
import { executeFinanceCorrection, type FinanceCorrectionCommand } from './finance-corrections-api';
import { executeFinanceClose, getFinanceCloseSnapshot, type FinanceCloseRequest } from './finance-close-api';
import { executeFinanceRecognition } from './finance-recognition-api';
import { v2TestId } from './v2-test.fixture';
const context = { businessId: 'api-synthetic', userId: 'owner', accessToken: 'synthetic-token' };
afterEach(() => vi.unstubAllGlobals());
const refund: FinanceCorrectionCommand = { type: 'REFUND_PAYMENT', bookingId: v2TestId, paymentId: v2TestId, currentPricingId: v2TestId, expectedBookingUpdatedAt: '2026-09-30T12:00:00.000Z', expectedFinancialVersion: 1, expectedPaymentVersion: 1, amountMinor: 200000, occurredAt: '2026-09-30T12:00:00.000Z', accountId: v2TestId, expectedAccountVersion: 1, reference: null, reason: 'Devolución declarada' };
it.each([204, 200])('D2 HTTP%s vacío no acredita devolución ni cierre ni certificación', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => status === 204 ? new Response(null, { status }) : new Response('{}')));
  await expect(executeFinanceCorrection(context, refund, 'same-key')).rejects.toMatchObject({ name: 'ApiResponseError' });
  await expect(executeFinanceClose(context, { operation: 'CREATE_PERIOD', command: { from: '2026-09-01', to: '2026-10-01', reason: 'Período declarado' } }, 'same-key')).rejects.toMatchObject({ name: 'ApiResponseError' });
  await expect(executeFinanceRecognition(context, { operation: 'CERTIFY_SERVICE', command: { bookingId: v2TestId, expectedBookingUpdatedAt: refund.expectedBookingUpdatedAt, expectedCertificateVersion: 0, expectedPricingSourceId: v2TestId, servedNights: ['2026-09-01'], effectiveCheckInOn: '2026-09-01', effectiveCheckOutOn: null, evidence: 'Acta declarada', reason: 'Prestación declarada', supersedesCertificateId: null } }, 'same-key')).rejects.toMatchObject({ name: 'ApiResponseError' });
});
it('ajuste con UUID/version válidos de otro cobro se rechaza como respuesta inválida', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: v2TestId, type: 'REFUND_PAYMENT', version: 1, bookingId: v2TestId, paymentId: 'other-payment', currentPricingId: v2TestId, paymentVersion: 2, financialVersion: 2, amounts: { grossRecordedAmountMinor: 1000000, voidedAmountMinor: 0, refundedAmountMinor: 200000, netRetainedAmountMinor: 800000 }, applicationReversals: [] }))));
  await expect(executeFinanceCorrection(context, refund, 'same-key')).rejects.toMatchObject({ name: 'ApiResponseError' });
});
it('snapshot de otra identidad de negocio no habilita un paquete ni descarga', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: v2TestId, businessId: 'other-business', periodId: v2TestId, closeVersion: 1, payloadHash: 'hash', sourceToken: 'token', sourceRefs: [], checklist: [] }))));
  await expect(getFinanceCloseSnapshot(context, v2TestId, v2TestId)).rejects.toMatchObject({ name: 'ApiResponseError' });
});
it('respuesta de cierre con evento versionado pero estado OPEN no anuncia un cierre', async () => {
  const request: FinanceCloseRequest = { operation: 'CLOSE_PERIOD', periodId: v2TestId, command: { expectedVersion: 1, expectedSourceToken: 'token', reason: 'Cierre declarado', acknowledgements: {} } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ period: { id: v2TestId, businessId: context.businessId, version: 2, status: 'OPEN' }, event: { id: v2TestId, businessId: context.businessId, periodId: v2TestId, type: 'CLOSE', afterVersion: 2 }, snapshot: { id: v2TestId, businessId: context.businessId, periodId: v2TestId, closeVersion: 2, payloadHash: 'hash', sourceToken: 'token', sourceRefs: [], checklist: [] } }))));
  await expect(executeFinanceClose(context, request, 'same-key')).rejects.toMatchObject({ name: 'ApiResponseError' });
});
