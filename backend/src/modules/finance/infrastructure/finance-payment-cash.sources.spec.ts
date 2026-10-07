import { financePaymentCashState, financePaymentCashFacts, requireFinanceCashSources, financeReceiptSourceVersion, financeCashSafe } from './finance-payment-cash.sources';
import type { FinancePaymentSource, FinancePaymentAdjustmentSource } from '../../payment/payment.contract';

const paidAt = '2026-09-10T00:00:00Z';
const payment = (paymentVersion = 1, amountMinor = 400): FinancePaymentSource => ({ id: 'payment', bookingId: 'booking', amountMinor, currency: 'PYG', paidAt, reference: null, paymentVersion });
const refund = (amountMinor = 150): FinancePaymentAdjustmentSource => ({ id: 'refund', paymentId: 'payment', bookingId: 'booking', kind: 'REFUND', amountMinor, currency: 'PYG', occurredAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', accountId: 'refundAccount', sequence: 1 });
const voided = (): FinancePaymentAdjustmentSource => ({ ...refund(400), id: 'void', kind: 'VOID', occurredAt: paidAt, accountId: null });

describe('Finance public Payment cash bases', () => {
  it('retains immutable gross but applies only own-date refunds before the queried cut', () => {
    expect(financePaymentCashState(payment(2), [refund()], new Date('2026-10-01T00:00:00Z'))).toMatchObject({ grossRecordedAmountMinor: 400, refundedAmountMinor: 0, netRetainedAmountMinor: 400, paymentVersion: 2, effectiveStatus: 'RETAINED' });
    expect(financePaymentCashState(payment(2), [refund()], new Date('2026-11-01T00:00:00Z'))).toMatchObject({ refundedAmountMinor: 150, netRetainedAmountMinor: 250, effectiveStatus: 'PARTIALLY_REFUNDED' });
  });
  it('derives a void at original paidAt with zero retained money and no new transfer fact', () => {
    const facts = financePaymentCashFacts([payment(2)], [voided()], [{ paymentId: 'payment', accountId: 'originalAccount', version: 2 }]);
    expect(facts.map(row => [row.sourceType, row.occurredAt, row.amountMinor, row.accountId])).toEqual([['PAYMENT', paidAt, 400, 'originalAccount'], ['VOID', paidAt, -400, 'originalAccount']]);
    expect(financePaymentCashState(payment(2), [voided()])).toMatchObject({ effectiveStatus: 'VOIDED', netRetainedAmountMinor: 0 });
  });
  it('preserves own refund account even when the original receipt link moves to another account', () => {
    expect(financePaymentCashFacts([payment(2)], [refund()], [{ paymentId: 'payment', accountId: 'changedAccount', version: 3 }])[1]).toMatchObject({ sourceType: 'REFUND', accountId: 'refundAccount', sourceVersion: 2, amountMinor: -150 });
  });
  it('recognizes a full refund without treating it as an expense or cancellation penalty', () => { expect(financePaymentCashState(payment(2), [refund(400)])).toMatchObject({ effectiveStatus: 'REFUNDED', netRetainedAmountMinor: 0, voidedAmountMinor: 0 }); });
  it('preserves the legacy link counter while invalidating reviews when Payment changes', () => {
    expect(financeReceiptSourceVersion(1, 3)).toBe(3);
    expect(financeReceiptSourceVersion(2, 3)).toBe(4);
  });
  it('fails closed if a refund and void are combined in either registration order', () => {
    expect(() => financePaymentCashState(payment(3), [refund(), { ...voided(), sequence: 2 }])).toThrow();
    expect(() => financePaymentCashState(payment(3), [voided(), { ...refund(), sequence: 2 }])).toThrow();
  });
  it.each([{ ...refund(), paymentId: 'foreign' }, { ...refund(), bookingId: 'foreign' }, { ...refund(), currency: 'USD' }, { ...refund(), accountId: null }, { ...refund(), occurredAt: '2026-09-01T00:00:00Z' }, { ...refund(), amountMinor: -1 }, { ...refund(), sequence: 2 }])('rejects mismatched, negative or out-of-sequence public facts %p', row => { expect(() => requireFinanceCashSources([payment(2)], [row])).toThrow(); });
  it('rejects partial voids, over-refunds, duplicate facts, lost versions and legacy currency', () => {
    expect(() => financePaymentCashState(payment(2), [{ ...voided(), amountMinor: 10 }])).toThrow();
    expect(() => financePaymentCashState(payment(2), [refund(401)])).toThrow();
    expect(() => requireFinanceCashSources([payment(3)], [refund(), refund()])).toThrow();
    expect(() => financePaymentCashState(payment(1), [refund()])).toThrow();
    expect(() => financePaymentCashState({ ...payment(), currency: 'USD' }, [])).toThrow('PYG');
  });
  it('maps unsafe report aggregation to an explicit conflict while retaining individually safe originals', () => { expect(() => financeCashSafe(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow('rango'); });
});
