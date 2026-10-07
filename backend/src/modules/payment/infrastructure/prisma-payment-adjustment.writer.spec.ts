import type { Prisma } from '@prisma/client';
import { assertFinancePeriodOpen } from '../../../shared/infrastructure/finance-period.guard';
import { appendBookingTimelineEvent } from '../../booking/booking.contract';
import { readCurrentPricing } from '../../pricing/pricing.contract';
import { PaymentAdjustmentConflictError, PaymentAdjustmentForbiddenError } from '../domain/payment-adjustment.rules';
import type { PaymentAdjustmentInput, RefundAccountScope } from '../domain/payment-adjustment.types';
import { appendPaymentAdjustment } from './prisma-payment-adjustment.writer';

jest.mock('../../../shared/infrastructure/finance-period.guard', () => ({ assertFinancePeriodOpen: jest.fn() }));
jest.mock('../../booking/booking.contract', () => ({ appendBookingTimelineEvent: jest.fn() }));
jest.mock('../../pricing/pricing.contract', () => ({ readCurrentPricing: jest.fn() }));

const businessId = 'business';
const bookingId = 'booking';
const paymentId = 'payment';
const bookingUpdatedAt = new Date('2026-10-01T10:00:00.000Z');
const paidAt = new Date('2026-09-01T10:00:00.000Z');
const occurredAt = '2026-10-04T12:00:00.000Z';

interface OriginalApplication {
  installmentId: string;
  amountMinor: bigint;
  dueDate: Date | null;
  sortOrder: number;
}

interface AdjustmentFact {
  businessId: string;
  bookingId: string;
  paymentId: string;
  kind: 'VOID' | 'REFUND';
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  reason: string;
  reference: string | null;
  accountId: string | null;
  sequence: number;
  requestId: string;
  recordedByUserId: string;
  beforeStateJson: unknown;
  afterStateJson: unknown;
}

interface ReversalFact {
  businessId: string;
  paymentId: string;
  installmentId: string;
  adjustmentId: string;
  amountMinor: bigint;
}

function refund(overrides: Partial<Omit<Extract<PaymentAdjustmentInput, { kind: 'REFUND' }>, 'kind'>> = {}): PaymentAdjustmentInput {
  return {
    businessId, bookingId, paymentId, actorUserId: 'owner', requestId: 'request', reason: '  Devolucion acordada  ',
    expectedBookingUpdatedAt: bookingUpdatedAt.toISOString(), currentPricingId: 'price', expectedPaymentVersion: 1,
    expectedFinancialVersion: 1, kind: 'REFUND', amountMinor: 300, occurredAt, accountId: 'account',
    expectedAccountVersion: 4, reference: '  Ref privada  ', ...overrides,
  };
}

function voidPayment(overrides: Partial<Omit<Extract<PaymentAdjustmentInput, { kind: 'VOID' }>, 'kind'>> = {}): PaymentAdjustmentInput {
  return { businessId, bookingId, paymentId, actorUserId: 'owner', requestId: 'request', reason: 'Error de registro', expectedBookingUpdatedAt: bookingUpdatedAt.toISOString(), currentPricingId: 'price', expectedPaymentVersion: 1, expectedFinancialVersion: 1, kind: 'VOID', ...overrides };
}

function fixture(applications: OriginalApplication[] = [
  { installmentId: 'early', amountMinor: 600n, dueDate: new Date('2026-09-01'), sortOrder: 0 },
  { installmentId: 'unscheduled', amountMinor: 200n, dueDate: null, sortOrder: 1 },
]) {
  const events: string[] = [];
  const original = Object.freeze({ id: paymentId, amountMinor: 1000n, status: 'RECORDED', paidAt, fingerprint: 'original-fingerprint' });
  const originals = applications.map((row) => Object.freeze({ ...row }));
  const adjustments: AdjustmentFact[] = [];
  const reversals: ReversalFact[] = [];
  const authority = { status: 'ACTIVE', role: 'OWNER' };
  const initial = { refunded: 0n, voided: 0n, version: 1n };
  const account: RefundAccountScope = { accountId: 'account', accountVersion: 4, openingId: 'opening', openingOccurredAt: new Date('2026-08-01') };
  const effectiveState = () => {
    const refunded = initial.refunded + adjustments.filter((row) => row.kind === 'REFUND').reduce((sum, row) => sum + row.amountMinor, 0n);
    const voided = initial.voided + adjustments.filter((row) => row.kind === 'VOID').reduce((sum, row) => sum + row.amountMinor, 0n);
    return [{ paymentId, businessId, bookingId, currency: 'PYG', grossRecordedAmountMinor: original.amountMinor, refundedAmountMinor: refunded, voidedAmountMinor: voided, netRetainedAmountMinor: original.amountMinor - refunded - voided, paymentVersion: initial.version + BigInt(adjustments.length), invalidMonetaryData: false, applicationInvalid: false }];
  };
  const effectiveApplications = () => originals.map((row) => {
    const reversed = reversals.filter((item) => item.installmentId === row.installmentId).reduce((sum, item) => sum + item.amountMinor, 0n);
    return { paymentId, installmentId: row.installmentId, originalAmountMinor: row.amountMinor, reversedAmountMinor: reversed, effectiveAmountMinor: row.amountMinor - reversed, dueDate: row.dueDate, sortOrder: row.sortOrder, invalidMonetaryData: false, scoped: true };
  });
  const queryHandlers = [
    { marker: 'FROM "User"', event: 'User SHARE', read: () => [{ status: authority.status }] },
    { marker: 'FROM "UserBusinessMembership"', event: 'Membership SHARE', read: () => [{ role: authority.role }] },
    { marker: 'FROM "Booking"', event: 'Booking UPDATE', read: () => [{ updatedAt: bookingUpdatedAt }] },
    { marker: 'FROM "Business"', event: 'Business SHARE', read: () => [{ status: 'ACTIVE', currency: 'PYG' }] },
    { marker: 'FROM "PricingSnapshot"', event: 'Snapshot UPDATE', read: () => [{ id: 'snapshot' }] },
    { marker: 'FROM "Payment"', event: 'Payment UPDATE', read: () => [{ paidAt }] },
    { marker: 'FROM "PaymentEffectiveState"', event: 'Effective payments', read: effectiveState },
    { marker: 'FROM "PaymentApplication"', event: 'Applications UPDATE', read: () => [] },
    { marker: 'FROM "PaymentApplicationEffective"', event: 'Effective applications', read: effectiveApplications },
  ];
  const raw = jest.fn((strings: TemplateStringsArray, ...parameters: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('to_char(')) {
      events.push('Local effective date');
      return Promise.resolve([{ date: (parameters[0] as Date).toISOString().slice(0, 10) }]);
    }
    const handler = queryHandlers.find((item) => sql.includes(item.marker));
    if (!handler) throw new Error(`Unexpected fixture query: ${sql}`);
    events.push(handler.event);
    return Promise.resolve(handler.read());
  });
  const adjustmentCreate = jest.fn(({ data }: { data: AdjustmentFact }) => {
    events.push('Adjustment append');
    adjustments.push(data);
    return Promise.resolve({ id: 'adjustment' });
  });
  const reversalCreateMany = jest.fn(({ data }: { data: ReversalFact[] }) => {
    events.push('Reversals append');
    reversals.push(...data);
    return Promise.resolve({ count: data.length });
  });
  const forbiddenMutation = jest.fn(() => { throw new Error('Original financial history cannot be mutated'); });
  const transaction = {
    $queryRaw: raw,
    payment: { update: forbiddenMutation, delete: forbiddenMutation, deleteMany: forbiddenMutation },
    paymentApplication: { update: forbiddenMutation, delete: forbiddenMutation, deleteMany: forbiddenMutation },
    paymentAdjustment: { create: adjustmentCreate },
    paymentApplicationReversal: { createMany: reversalCreateMany },
  } as unknown as Prisma.TransactionClient;
  const resolveAccount = jest.fn(() => {
    events.push('Account SHARE');
    return Promise.resolve(account);
  });
  jest.mocked(readCurrentPricing).mockImplementation(() => {
    events.push('Current pricing');
    return Promise.resolve({ id: 'price', currency: 'PYG', totalAmountMinor: 1000 } as Awaited<ReturnType<typeof readCurrentPricing>>);
  });
  jest.mocked(assertFinancePeriodOpen).mockImplementation(() => {
    events.push('Period guard');
    return Promise.resolve();
  });
  jest.mocked(appendBookingTimelineEvent).mockImplementation(() => {
    events.push('Timeline append');
    return Promise.resolve();
  });
  return { transaction, events, original, originals, adjustments, reversals, authority, initial, account, effectiveApplications, raw, adjustmentCreate, reversalCreateMany, forbiddenMutation, resolveAccount };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
});
afterEach(() => jest.useRealTimers());

describe('append-only Payment adjustment writer', () => {
  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'])('rejects %s before economic locks or account resolution', async (role) => {
    const scope = fixture();
    scope.authority.role = role;
    await expect(appendPaymentAdjustment(scope.transaction, refund(), scope.resolveAccount)).rejects.toThrow(PaymentAdjustmentForbiddenError);
    expect(scope.events).toEqual(['User SHARE', 'Membership SHARE']);
    expect(scope.adjustmentCreate).not.toHaveBeenCalled();
    expect(scope.resolveAccount).not.toHaveBeenCalled();
  });

  it('rejects an inactive owner before economic locks', async () => {
    const scope = fixture();
    scope.authority.status = 'INACTIVE';
    await expect(appendPaymentAdjustment(scope.transaction, refund(), scope.resolveAccount)).rejects.toThrow(PaymentAdjustmentForbiddenError);
    expect(scope.events).toEqual(['User SHARE', 'Membership SHARE']);
  });

  it.each([
    { expectedBookingUpdatedAt: '2026-10-01T10:00:01.000Z' },
    { currentPricingId: 'old-price' },
    { expectedPaymentVersion: 2 },
    { expectedFinancialVersion: 2 },
  ])('rejects stale expectations %p before adding facts or resolving accounts', async (expectation) => {
    const scope = fixture();
    await expect(appendPaymentAdjustment(scope.transaction, refund(expectation), scope.resolveAccount)).rejects.toThrow(PaymentAdjustmentConflictError);
    expect(scope.adjustmentCreate).not.toHaveBeenCalled();
    expect(scope.reversalCreateMany).not.toHaveBeenCalled();
    expect(scope.resolveAccount).not.toHaveBeenCalled();
    expect(appendBookingTimelineEvent).not.toHaveBeenCalled();
  });

  it('refunds unallocated credit first and releases only the original application remainder', async () => {
    const scope = fixture();
    const result = await appendPaymentAdjustment(scope.transaction, refund(), scope.resolveAccount);
    expect(result).toEqual({ id: 'adjustment', type: 'REFUND_PAYMENT', version: 2, bookingId, paymentId, currentPricingId: 'price', paymentVersion: 2, financialVersion: 2, amounts: { grossRecordedAmountMinor: 1000, voidedAmountMinor: 0, refundedAmountMinor: 300, netRetainedAmountMinor: 700 }, applicationReversals: [{ installmentId: 'unscheduled', amountMinor: 100 }] });
    expect(scope.effectiveApplications().map((row) => row.effectiveAmountMinor)).toEqual([600n, 100n]);
    expect(scope.original).toEqual({ id: paymentId, amountMinor: 1000n, status: 'RECORDED', paidAt, fingerprint: 'original-fingerprint' });
    expect(scope.originals.map((row) => row.amountMinor)).toEqual([600n, 200n]);
    expect(scope.forbiddenMutation).not.toHaveBeenCalled();
    expect(scope.adjustments[0]).toMatchObject({ paymentId, kind: 'REFUND', amountMinor: 300n, reason: 'Devolucion acordada', reference: 'Ref privada', accountId: 'account', occurredAt: new Date(occurredAt), sequence: 1, requestId: 'request' });
    expect(scope.reversals).toEqual([{ businessId, paymentId, installmentId: 'unscheduled', adjustmentId: 'adjustment', amountMinor: 100n }]);
    expect(appendBookingTimelineEvent).toHaveBeenCalledWith(scope.transaction, { businessId, bookingId, actorUserId: 'owner', type: 'PAYMENT_REFUND_RECORDED', details: { adjustmentId: 'adjustment', paymentId } });
  });

  it('keeps every application when the refund fits the unallocated credit', async () => {
    const scope = fixture();
    const result = await appendPaymentAdjustment(scope.transaction, refund({ amountMinor: 100 }), scope.resolveAccount);
    expect(result.amounts.netRetainedAmountMinor).toBe(900);
    expect(result.applicationReversals).toEqual([]);
    expect(scope.reversalCreateMany).not.toHaveBeenCalled();
    expect(scope.effectiveApplications().map((row) => row.effectiveAmountMinor)).toEqual([600n, 200n]);
  });

  it('releases inverse due-date, sort-order and ordinal-id priority across tied installments', async () => {
    const scope = fixture([
      { installmentId: 'early', amountMinor: 300n, dueDate: new Date('2026-08-01'), sortOrder: 9 },
      { installmentId: 'late-low', amountMinor: 100n, dueDate: new Date('2026-09-01'), sortOrder: 1 },
      { installmentId: 'late-high-a', amountMinor: 100n, dueDate: new Date('2026-09-01'), sortOrder: 2 },
      { installmentId: 'late-high-z', amountMinor: 100n, dueDate: new Date('2026-09-01'), sortOrder: 2 },
      { installmentId: 'null-a', amountMinor: 100n, dueDate: null, sortOrder: 0 },
      { installmentId: 'null-z', amountMinor: 100n, dueDate: null, sortOrder: 0 },
    ]);
    const result = await appendPaymentAdjustment(scope.transaction, refund({ amountMinor: 650 }), scope.resolveAccount);
    expect(result.applicationReversals).toEqual([
      { installmentId: 'null-z', amountMinor: 100 }, { installmentId: 'null-a', amountMinor: 100 },
      { installmentId: 'late-high-z', amountMinor: 100 }, { installmentId: 'late-high-a', amountMinor: 100 },
      { installmentId: 'late-low', amountMinor: 50 },
    ]);
    expect(scope.originals.map((row) => row.amountMinor)).toEqual([300n, 100n, 100n, 100n, 100n, 100n]);
  });

  it('locks authority, booking, business, snapshot and payment before consulting the refund account', async () => {
    const scope = fixture();
    await appendPaymentAdjustment(scope.transaction, refund(), scope.resolveAccount);
    expect(scope.events).toEqual(['User SHARE', 'Membership SHARE', 'Booking UPDATE', 'Business SHARE', 'Snapshot UPDATE', 'Current pricing', 'Payment UPDATE', 'Effective payments', 'Applications UPDATE', 'Effective applications', 'Account SHARE', 'Local effective date', 'Period guard', 'Adjustment append', 'Reversals append', 'Effective payments', 'Timeline append']);
    expect(scope.resolveAccount).toHaveBeenCalledWith(scope.transaction, { businessId, accountId: 'account', expectedAccountVersion: 4, occurredAt: new Date(occurredAt) });
    expect(assertFinancePeriodOpen).toHaveBeenCalledWith(scope.transaction, businessId, ['2026-10-04'], []);
  });

  it('voids the full original without changing its recorded status, date or applications', async () => {
    const scope = fixture();
    const result = await appendPaymentAdjustment(scope.transaction, voidPayment(), scope.resolveAccount);
    expect(result.amounts).toEqual({ grossRecordedAmountMinor: 1000, voidedAmountMinor: 1000, refundedAmountMinor: 0, netRetainedAmountMinor: 0 });
    expect(result.applicationReversals).toEqual([{ installmentId: 'unscheduled', amountMinor: 200 }, { installmentId: 'early', amountMinor: 600 }]);
    expect(scope.adjustments[0]).toMatchObject({ amountMinor: 1000n, occurredAt: paidAt, reference: null, accountId: null, kind: 'VOID' });
    expect(scope.original.status).toBe('RECORDED');
    expect(scope.originals.map((row) => row.amountMinor)).toEqual([600n, 200n]);
    expect(scope.resolveAccount).not.toHaveBeenCalled();
    expect(scope.forbiddenMutation).not.toHaveBeenCalled();
    expect(assertFinancePeriodOpen).toHaveBeenCalledWith(scope.transaction, businessId, ['2026-09-01'], [{ type: 'PAYMENT', id: paymentId }]);
  });

  it('rejects VOID after an earlier refund even with current expectations', async () => {
    const scope = fixture();
    scope.initial.refunded = 100n;
    scope.initial.version = 2n;
    await expect(appendPaymentAdjustment(scope.transaction, voidPayment({ expectedPaymentVersion: 2, expectedFinancialVersion: 2 }))).rejects.toThrow(PaymentAdjustmentConflictError);
    expect(scope.adjustmentCreate).not.toHaveBeenCalled();
    expect(scope.reversalCreateMany).not.toHaveBeenCalled();
    expect(assertFinancePeriodOpen).not.toHaveBeenCalled();
  });

  it.each([{ accountId: 'other-account' }, { accountVersion: 5 }, { openingId: '' }, { openingOccurredAt: new Date('2026-10-05') }])('rejects incompatible refund account %p before appending facts', async (account) => {
    const scope = fixture();
    Object.assign(scope.account, account);
    await expect(appendPaymentAdjustment(scope.transaction, refund(), scope.resolveAccount)).rejects.toThrow(PaymentAdjustmentConflictError);
    expect(scope.resolveAccount).toHaveBeenCalledTimes(1);
    expect(scope.adjustmentCreate).not.toHaveBeenCalled();
    expect(scope.reversalCreateMany).not.toHaveBeenCalled();
  });

  it('rejects a closed refund date before append-only financial writes', async () => {
    const scope = fixture();
    jest.mocked(assertFinancePeriodOpen).mockRejectedValue(new Error('FINANCE_PERIOD_CLOSED'));
    await expect(appendPaymentAdjustment(scope.transaction, refund(), scope.resolveAccount)).rejects.toThrow('FINANCE_PERIOD_CLOSED');
    expect(scope.adjustmentCreate).not.toHaveBeenCalled();
    expect(scope.reversalCreateMany).not.toHaveBeenCalled();
    expect(appendBookingTimelineEvent).not.toHaveBeenCalled();
  });
});
