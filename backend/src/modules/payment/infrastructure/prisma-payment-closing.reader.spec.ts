import type { Prisma } from '@prisma/client';
import { readEffectivePayments } from './prisma-payment-effective.reader';
import { readPaymentClosingSources } from './prisma-payment-closing.reader';

jest.mock('./prisma-payment-effective.reader', () => ({ readEffectivePayments: jest.fn() }));

const businessId = 'business';
const originalAt = new Date('2026-09-01T10:00:00.000Z');
const refundAt = new Date('2026-10-01T10:00:00.000Z');
const secondRefundAt = new Date('2026-10-03T10:00:00.000Z');

function fixture() {
  const payment = { id: 'payment', businessId, bookingId: 'booking', amountMinor: 100n, currency: 'PYG', method: 'CASH', status: 'RECORDED', paidAt: originalAt, createdAt: originalAt };
  const plan = { id: 'plan', businessId, bookingId: 'booking', currency: 'PYG', totalAmountMinor: 100n, createdAt: originalAt, updatedAt: originalAt };
  const installment = { id: 'installment', paymentPlanId: plan.id, amountMinor: 100n, dueDate: null, sortOrder: 0 };
  const application = { paymentId: payment.id, installmentId: installment.id, amountMinor: 100n, createdAt: originalAt };
  const adjustment = { id: 'refund', businessId, bookingId: 'booking', paymentId: payment.id, kind: 'REFUND', amountMinor: 20n, currency: 'PYG', occurredAt: refundAt, createdAt: refundAt, sequence: 1 };
  const reversal = { id: 'reversal', businessId, paymentId: payment.id, installmentId: installment.id, adjustmentId: adjustment.id, amountMinor: 20n, createdAt: refundAt };
  const data = { payments: [payment], plans: [plan], installments: [installment], applications: [application], adjustments: [adjustment], reversals: [reversal] };
  const dated = <T extends { createdAt: Date }>(rows: T[]) => jest.fn((input: { where: { createdAt?: { lte: Date } } }) => Promise.resolve(rows.filter((row) => row.createdAt <= (input.where.createdAt?.lte ?? new Date(8640000000000000)))));
  const delegates = { payment: { findMany: dated(data.payments) }, paymentPlan: { findMany: dated(data.plans) }, paymentPlanInstallment: { findMany: jest.fn(() => Promise.resolve(data.installments)) }, paymentApplication: { findMany: dated(data.applications) }, paymentAdjustment: { findMany: dated(data.adjustments) }, paymentApplicationReversal: { findMany: dated(data.reversals) } };
  return { data, delegates, transaction: delegates as unknown as Prisma.TransactionClient };
}

describe('Given immutable Payment history, when Finance captures closing sources', () => {
  beforeEach(() => jest.mocked(readEffectivePayments).mockResolvedValue([]));

  it('then captures gross/net and composite original application IDs alongside adjustments and reversals', async () => {
    const scope = fixture();
    const result = await readPaymentClosingSources(scope.transaction, businessId, secondRefundAt);
    expect(result.complete).toBe(true);
    expect(result.payload).toEqual(expect.objectContaining({ payments: [expect.objectContaining({ grossRecordedAmountMinor: 100, refundedAmountMinor: 20, netRetainedAmountMinor: 80, paymentVersion: 2 })], applications: [expect.objectContaining({ amountMinor: 100, reversedAmountMinor: 20, effectiveAmountMinor: 80 })] }));
    expect(result.sourceRefs).toContainEqual({ type: 'PAYMENT_APPLICATION', id: 'payment:installment', version: '1' });
    expect(result.sourceRefs.map((row) => row.type)).toEqual(['PAYMENT', 'PAYMENT_PLAN', 'PAYMENT_INSTALLMENT', 'PAYMENT_APPLICATION', 'PAYMENT_ADJUSTMENT', 'PAYMENT_APPLICATION_REVERSAL']);
    expect(JSON.stringify(result.payload)).not.toMatch(/recordedBy|reason|reference|accountId|note|fingerprint|idempotency/);
    expect(scope.data.payments[0].amountMinor).toBe(100n);
    expect(scope.data.applications[0].amountMinor).toBe(100n);
  });

  it('then fixes the historical cut and omits refunds recorded afterwards', async () => {
    const scope = fixture();
    const result = await readPaymentClosingSources(scope.transaction, businessId, new Date('2026-09-30T23:00:00.000Z'));
    expect(result.payload).toEqual(expect.objectContaining({ payments: [expect.objectContaining({ refundedAmountMinor: 0, netRetainedAmountMinor: 100, paymentVersion: 1 })], adjustments: [], applicationReversals: [], applications: [expect.objectContaining({ effectiveAmountMinor: 100 })] }));
  });

  it('then keeps the server source token stable when only asOf advances', async () => {
    const scope = fixture();
    const first = await readPaymentClosingSources(scope.transaction, businessId, secondRefundAt);
    const later = await readPaymentClosingSources(scope.transaction, businessId, new Date('2026-10-04T10:00:00.000Z'));
    expect(first.sourceToken).toMatch(/^[a-f0-9]{64}$/);
    expect(later.sourceToken).toBe(first.sourceToken);
    scope.data.adjustments[0].amountMinor = 30n;
    scope.data.reversals[0].amountMinor = 30n;
    expect((await readPaymentClosingSources(scope.transaction, businessId, secondRefundAt)).sourceToken).not.toBe(first.sourceToken);
  });

  it('then declares an earlier cut incomplete when a mutable plan was changed afterwards', async () => {
    const scope = fixture();
    scope.data.plans[0].updatedAt = secondRefundAt;
    expect((await readPaymentClosingSources(scope.transaction, businessId, refundAt)).complete).toBe(false);
  });

  it('then rejects a source above the 5000 record ceiling without truncating', async () => {
    const scope = fixture();
    scope.delegates.payment.findMany.mockResolvedValue(Array.from({ length: 5001 }, () => scope.data.payments[0]));
    await expect(readPaymentClosingSources(scope.transaction, businessId, secondRefundAt)).rejects.toThrow('5000');
  });

  it.each(['currency', 'unsafe', 'application', 'reversal', 'sequence', 'installment'])('then fails closed on %s corruption', async (kind) => {
    const scope = fixture();
    if (kind === 'currency') scope.data.payments[0].currency = 'USD';
    if (kind === 'unsafe') scope.data.payments[0].amountMinor = 9007199254740992n;
    if (kind === 'application') scope.data.applications[0].installmentId = 'foreign';
    if (kind === 'reversal') scope.data.reversals[0].adjustmentId = 'foreign';
    if (kind === 'sequence') scope.data.adjustments[0].sequence = 2;
    if (kind === 'installment') scope.data.installments[0].amountMinor = 101n;
    await expect(readPaymentClosingSources(scope.transaction, businessId, secondRefundAt)).rejects.toThrow();
  });
});
