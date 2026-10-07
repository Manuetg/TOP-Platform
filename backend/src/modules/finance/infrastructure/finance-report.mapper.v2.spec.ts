import { mapFinanceReport } from './finance-report.mapper';
import type { FinanceSources } from './finance-report.loader';
import type { FinancePaymentSource, FinancePaymentAdjustmentSource } from '../../payment/payment.contract';

const actor = { businessId: 'business', actorUserId: 'owner' };
const october = { from: '2026-10-01', to: '2026-11-01' };
const payment = (paidAt = '2026-09-10T00:00:00Z', amountMinor = 400): FinancePaymentSource => ({ id: 'payment', bookingId: 'booking', amountMinor, currency: 'PYG', paidAt, reference: null, paymentVersion: 2 });
const refund = (amountMinor = 150): FinancePaymentAdjustmentSource => ({ id: 'refund', paymentId: 'payment', bookingId: 'booking', kind: 'REFUND', amountMinor, currency: 'PYG', occurredAt: '2026-10-02T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', accountId: 'refundAccount', sequence: 1 });
function sources(original = payment(), adjustment = refund()): FinanceSources {
  const account = (id: string) => ({ id, businessId: 'business', name: id, currency: 'PYG', kind: 'CASH', version: 1, archived: false, createdAt: new Date('2026-01-01'), opening: { id: `${id}-opening`, businessId: 'business', accountId: id, amountMinor: 100n, occurredAt: new Date('2026-01-01'), reason: 'Apertura', recordedByUserId: 'owner', createdAt: new Date('2026-01-01') } });
  return { bounds: { from: new Date('2026-10-01'), to: new Date('2026-11-01') }, catalogs: [], resources: [], accounts: [account('originalAccount'), account('refundAccount')], expenses: [], settlements: [], links: [{ id: 'link', businessId: 'business', paymentId: original.id, accountId: 'originalAccount', version: 1, recordedByUserId: 'owner', createdAt: new Date('2026-01-01') }], transfers: [], cashMovements: [], reviews: [], reviewOccurredAt: {}, cashCounts: [], payments: [original], paymentAdjustments: [adjustment] };
}

describe('cash V1 D2 mapping, unequal periods and openings', () => {
  it('reports October refund flow negative without inventing October receipt or operating expense', () => {
    const report = mapFinanceReport(actor, october, 'UTC', sources(), new Date('2026-11-02'));
    expect(report.totals).toMatchObject({ paymentsMinor: 0, grossRecordedAmountMinor: 0, voidedAmountMinor: 0, refundedAmountMinor: 150, netRecordedReceiptFlowMinor: -150, paymentNetRetainedAmountMinor: 0, expenseMinor: 0, operatingCostMinor: 0, registeredBalanceMinor: 450 });
    expect(report.accounts.map(row => row.balanceMinor)).toEqual([500, -50]);
    expect(report.movements).toEqual([expect.objectContaining({ sourceType: 'REFUND', sourceId: 'refund', paymentId: 'payment', accountId: 'refundAccount', amountMinor: -150 })]);
  });
  it('keeps September gross and retained cohort at its own cut before the October refund', () => {
    const fixture = sources(); fixture.bounds = { from: new Date('2026-09-01'), to: new Date('2026-10-01') };
    const report = mapFinanceReport(actor, { from: '2026-09-01', to: '2026-10-01' }, 'UTC', fixture, new Date('2026-11-02'));
    expect(report.totals).toMatchObject({ paymentsMinor: 400, grossRecordedAmountMinor: 400, refundedAmountMinor: 0, netRecordedReceiptFlowMinor: 400, paymentNetRetainedAmountMinor: 400, registeredBalanceMinor: 600 });
    expect(report.payments[0]).toMatchObject({ amountMinor: 400, netRetainedAmountMinor: 400, paymentVersion: 2, version: 1 });
  });
  it('corrects a void at old paidAt once and restores opening, with no current month cash outflow', () => {
    const original = payment(); const correction = { ...refund(400), id: 'void', kind: 'VOID' as const, occurredAt: original.paidAt, accountId: null };
    const report = mapFinanceReport(actor, october, 'UTC', sources(original, correction), new Date('2026-11-02'));
    expect(report.accounts.map(row => row.balanceMinor)).toEqual([100, 100]);
    expect(report.movements).toEqual([]);
    expect(report.balanceSources.filter(row => row.sourceType === 'VOID')).toEqual([expect.objectContaining({ sourceId: 'void', occurredAt: original.paidAt, amountMinor: -400 })]);
  });
  it('excludes a pre-opening original and its void together, preventing double opening correction', () => {
    const original = payment(); const correction = { ...refund(400), id: 'void', kind: 'VOID' as const, occurredAt: original.paidAt, accountId: null };
    const fixture = sources(original, correction); fixture.accounts[0].opening!.occurredAt = new Date('2026-10-01');
    const report = mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02'));
    expect(report.accounts[0].balanceMinor).toBe(100);
    expect(report.balanceSources.some(row => ['PAYMENT', 'VOID'].includes(row.sourceType))).toBe(false);
  });
  it('accepts a backdated refund after its own opening and preserves negative configured balance', () => {
    const fixture = sources(); fixture.accounts[1].opening!.occurredAt = new Date('2026-10-01');
    const report = mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02'));
    expect(report.accounts[1]).toMatchObject({ balanceMinor: -50, negative: true });
    expect(report.balanceSources.find(row => row.sourceType === 'REFUND')).toMatchObject({ occurredAt: '2026-10-02T00:00:00Z' });
  });
  it('fails closed for a refund before the opening of its own account', () => {
    const fixture = sources(); fixture.accounts[1].opening!.occurredAt = new Date('2026-10-03');
    expect(() => mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02'))).toThrow();
  });
  it('reports own gross, net cohort and flow explicitly when receipt and refund share a month', () => {
    const original = payment('2026-10-01T00:00:00Z');
    const report = mapFinanceReport(actor, october, 'UTC', sources(original), new Date('2026-11-02'));
    expect(report.totals).toMatchObject({ paymentsMinor: 400, refundedAmountMinor: 150, netRecordedReceiptFlowMinor: 250, paymentNetRetainedAmountMinor: 250 });
    expect(report.payments[0]).toMatchObject({ effectiveStatus: 'PARTIALLY_REFUNDED', grossRecordedAmountMinor: 400, voidedAmountMinor: 0, refundedAmountMinor: 150, netRetainedAmountMinor: 250 });
  });
  it('fails closed for an adjustment whose original belongs to another tenant-scoped source set', () => { const fixture = sources(); fixture.paymentAdjustments[0].paymentId = 'foreign'; expect(() => mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02'))).toThrow(); });
  it('keeps stable tokens while evidence is unchanged and changes token on a source revision', () => {
    const fixture = sources(); const first = mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02T00:00:00Z'));
    expect(mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02T01:00:00Z')).token).toBe(first.token);
    fixture.links[0].version += 1;
    expect(mapFinanceReport(actor, october, 'UTC', fixture, new Date('2026-11-02T01:00:00Z')).token).not.toBe(first.token);
  });
});
