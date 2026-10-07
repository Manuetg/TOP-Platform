import type { PaymentClosingSources } from '../../payment/payment.contract';
import { normalizeFinanceGuardReferences, paymentPeriodReferences } from './finance-composition.close';

function sources(): PaymentClosingSources {
  const payload = { payments: [{ id: 'old', paidAt: '2026-05-01T00:00:00Z' }, { id: 'future', paidAt: '2026-11-01T00:00:00Z' }], paymentPlans: [{ id: 'oldPlan', bookingId: 'oldBooking' }, { id: 'monthPlan', bookingId: 'monthBooking' }], installments: [{ id: 'oldInst', paymentPlanId: 'oldPlan', dueDate: '2026-05-01' }, { id: 'monthInst', paymentPlanId: 'monthPlan', dueDate: null }], applications: [{ paymentId: 'old', installmentId: 'oldInst', createdAt: '2026-05-01T00:00:00Z' }, { paymentId: 'old', installmentId: 'monthInst', createdAt: '2026-05-01T00:00:00Z' }], adjustments: [{ id: 'monthRefund', occurredAt: '2026-10-02T00:00:00Z' }, { id: 'laterRefund', occurredAt: '2026-11-01T00:00:00Z' }], applicationReversals: [{ id: 'monthRev', adjustmentId: 'monthRefund', paymentId: 'old', installmentId: 'monthInst' }, { id: 'laterRev', adjustmentId: 'laterRefund', paymentId: 'old', installmentId: 'monthInst' }] };
  const sourceRefs = [{ type: 'PAYMENT', id: 'old' }, { type: 'PAYMENT', id: 'future' }, { type: 'PAYMENT_PLAN', id: 'oldPlan' }, { type: 'PAYMENT_PLAN', id: 'monthPlan' }, { type: 'PAYMENT_INSTALLMENT', id: 'oldInst' }, { type: 'PAYMENT_INSTALLMENT', id: 'monthInst' }, { type: 'PAYMENT_APPLICATION', id: 'old:oldInst' }, { type: 'PAYMENT_APPLICATION', id: 'old:monthInst' }, { type: 'PAYMENT_ADJUSTMENT', id: 'monthRefund' }, { type: 'PAYMENT_ADJUSTMENT', id: 'laterRefund' }, { type: 'PAYMENT_APPLICATION_REVERSAL', id: 'monthRev' }, { type: 'PAYMENT_APPLICATION_REVERSAL', id: 'laterRev' }].map(row => ({ ...row, version: '1' }));
  return { payload, sourceRefs, sourceToken: 'a'.repeat(64), complete: true };
}

describe('month-scoped supplement guards', () => {
  it('retains prior receipt balance provenance without locking unrelated old plans or future refunds', () => {
    const refs = paymentPeriodReferences(sources(), { from: '2026-10-01', to: '2026-11-01' }, 'UTC', new Set(['monthBooking']));
    expect(refs.map(row => `${row.type}:${row.id}`)).toEqual(['PAYMENT:old', 'PAYMENT_PLAN:monthPlan', 'PAYMENT_INSTALLMENT:monthInst', 'PAYMENT_APPLICATION:old:monthInst', 'PAYMENT_ADJUSTMENT:monthRefund', 'PAYMENT_APPLICATION_REVERSAL:monthRev']);
  });
  it('uses business local date at the exclusive end, preserving payload originals', () => {
    const source = sources(); const before = JSON.stringify(source.payload);
    const refs = paymentPeriodReferences(source, { from: '2026-10-01', to: '2026-11-01' }, 'America/Asuncion', new Set());
    expect(refs.some(row => row.id === 'future')).toBe(true); // 00:00 UTC is still October locally.
    expect(JSON.stringify(source.payload)).toBe(before);
  });
  it('normalizes aliases and deduplicates stable type/id keys', () => {
    expect(normalizeFinanceGuardReferences([{ type: 'OWNER_IMPUTED', id: 'r', version: '2' }, { type: 'LABOR_REVISION', id: 'r', version: '2' }, { type: 'PAYMENT_APPLICATION', id: 'p:i', version: '1' }])).toEqual([{ type: 'LABOR_REVISION', id: 'r', version: '2' }, { type: 'PAYMENT_APPLICATION', id: 'p:i', version: '1' }]);
  });
});
