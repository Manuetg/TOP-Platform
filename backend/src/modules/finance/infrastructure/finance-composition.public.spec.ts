import { listFinanceServiceEvidence, type FinanceBookingServiceEvidence } from '../../booking/booking.contract';
import { readCurrentPricingClassifiedBatch, type ClassifiedCurrentPricing } from '../../pricing/pricing.contract';
import { readPaymentClosingSources, type PaymentClosingSources } from '../../payment/payment.contract';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import type { FinanceBookingFinancialBasis, FinancePaymentObligationBasis } from '../application/finance-v2-receivable.rules';
import { financeReceivableReader, readFinanceBookingPricing,financeJsonRecord } from './finance-composition.public';
import { adaptTransaction, type FinancePrismaRawTransaction } from './finance-v2-prisma-sql.adapter';
import { FinanceV2ReceivableReader } from './finance-v2-receivable.reader';

jest.mock('../../booking/booking.contract', () => ({ ...jest.requireActual<typeof import('../../booking/booking.contract')>('../../booking/booking.contract'), listFinanceServiceEvidence: jest.fn() }));
jest.mock('../../pricing/pricing.contract', () => ({ ...jest.requireActual<typeof import('../../pricing/pricing.contract')>('../../pricing/pricing.contract'), readCurrentPricingClassifiedBatch: jest.fn() }));
jest.mock('../../payment/payment.contract', () => ({ ...jest.requireActual<typeof import('../../payment/payment.contract')>('../../payment/payment.contract'), readPaymentClosingSources: jest.fn() }));

const businessId = '10000000-0000-4000-8000-000000000001';
const bookingId = '20000000-0000-4000-8000-000000000002';
const now = '2026-10-05T12:00:00.000Z';
const cut = '2026-10-05T11:00:00.000Z';
const native: FinancePrismaRawTransaction = {
  $queryRawUnsafe: <T>(): Promise<T> => Promise.reject(new Error('QA: composition must use public source ports.')),
  $executeRawUnsafe: (): Promise<number> => Promise.reject(new Error('QA: a read must not execute writes.')),
};
const tx = adaptTransaction(native);
const bookingsPort = jest.mocked(listFinanceServiceEvidence);
const pricingPort = jest.mocked(readCurrentPricingClassifiedBatch);
const paymentPort = jest.mocked(readPaymentClosingSources);

function booking(changes: Partial<FinanceBookingServiceEvidence> = {}): FinanceBookingServiceEvidence {
  return { businessId, bookingId, resourceIds: ['resource'], bookingUpdatedAt: cut, checkInDate: '2026-10-01', checkOutDate: '2026-10-03', status: 'CHECKED_OUT', checkInEventId: null, checkOutEventId: null, ...changes };
}
function price(changes: Partial<ClassifiedCurrentPricing> = {}): ClassifiedCurrentPricing {
  return { id: 'price', originalSnapshotId: 'snapshot', pricingRevisionId: 'price', revisionNumber: 2, businessId, bookingId, currency: 'PYG', totalAmountMinor: 100,
    items: [{ resourceId: 'resource', agreedAmountMinor: 100, overrideReason: 'Agreed manually.', nights: 2, breakdown: [], ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, adjustmentAmountMinor: null }],
    createdAt: new Date(cut), kind: 'SERVICE', sourceContext: { checkInDate: '2026-10-01', checkOutDate: '2026-10-03', resourceIds: ['resource'] }, ...changes };
}
function obligations(): FinancePaymentObligationBasis {
  return { complete: true, token: 'payment-cut', payments: [{ id: 'payment', bookingId, currency: 'PYG', status: 'RECORDED', netRetainedAmountMinor: 40, paymentVersion: 1 }], paymentPlans: [], installments: [], applications: [] };
}
function paymentSource(): PaymentClosingSources {
  const basis = obligations();
  return { payload: { payments: basis.payments.map(row=>({...row,businessId,paidAt:'2026-10-01T00:00:00.000Z',createdAt:'2026-10-01T01:00:00.000Z'})), adjustments: [], paymentPlans: [], installments: [], applications: [] }, sourceRefs: [], sourceToken: basis.token, complete: basis.complete };
}
async function expectSourceStale(operation: Promise<unknown>): Promise<void> {
  const outcome = await operation.catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(FinanceConflictError);
  expect(outcome).toMatchObject({ message: expect.stringContaining('SOURCE_STALE') as string });
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(now) });
  jest.clearAllMocks();
  bookingsPort.mockResolvedValue([booking()]);
  pricingPort.mockResolvedValue(new Map([[bookingId, price()]]));
  paymentPort.mockResolvedValue(paymentSource());
});
afterEach(() => { jest.useRealTimers(); });

describe('public Booking, Pricing and Payment composition uses one declared cut', () => {
  it('passes the same transaction, tenant and cut to both receivable source ports', async () => {
    const basis: FinanceBookingFinancialBasis = { bookingId, currency: 'PYG', sourceVersion: 2, pricingStatus: 'CURRENT', agreedMinor: 100, pricingToken: 'price-cut' };
    const bookingPricing = jest.fn<Promise<readonly FinanceBookingFinancialBasis[]>, [typeof tx, string, string]>().mockResolvedValue([basis]);
    const paymentObligations = jest.fn<Promise<FinancePaymentObligationBasis>, [typeof tx, string, string]>().mockResolvedValue(obligations());
    const result = await new FinanceV2ReceivableReader({ bookingPricing, paymentObligations }).read(tx, businessId, cut);
    expect(bookingPricing).toHaveBeenCalledWith(tx, businessId, cut);
    expect(paymentObligations).toHaveBeenCalledWith(tx, businessId, cut);
    expect(result.rows).toEqual([{ sourceKey: `BOOKING:${bookingId}`, bookingId, amountMinor: 60, dueOn: null, sourceVersion: 2, needsReview: false }]);
  });

  it('normalizes an offset cut before querying public Booking evidence on the native transaction', async () => {
    const result = await readFinanceBookingPricing(tx, businessId, '2026-10-05T08:00:00-03:00');
    expect(bookingsPort).toHaveBeenCalledWith(native, { businessId, from: '0001-01-01', to: '9999-12-31', asOf: cut, limit: 5000 });
    expect(pricingPort).toHaveBeenCalledWith(native, businessId, [bookingId]);
    expect(result).toEqual([{ bookingId, sourceVersion: 2, currency: 'PYG', pricingStatus: 'CURRENT', agreedMinor: 100, pricingToken: expect.any(String) as string }]);
  });

  it('accepts Booking and pricing created exactly at the cut and computes only the unpaid 60', async () => {
    const result = await financeReceivableReader.read(tx, businessId, cut);
    expect(bookingsPort).toHaveBeenCalledWith(native, expect.objectContaining({ businessId, asOf: cut }));
    expect(paymentPort).toHaveBeenCalledWith(native, businessId, new Date(cut));
    expect(result.rows).toEqual([{ sourceKey: `BOOKING:${bookingId}`, bookingId, amountMinor: 60, dueOn: null, sourceVersion: 2, needsReview: false }]);
    expect(result.credits).toEqual([]);
    expect(result.reviewBookingIds).toEqual([]);
  });

  it('rejects current Booking context changed one millisecond after the requested cut', async () => {
    bookingsPort.mockResolvedValue([booking({ bookingUpdatedAt: '2026-10-05T11:00:00.001Z' })]);
    await expectSourceStale(financeReceivableReader.read(tx, businessId, cut));
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it('rejects a newer current price rather than fabricating its prior revision', async () => {
    pricingPort.mockResolvedValue(new Map([[bookingId, price({ createdAt: new Date('2026-10-05T11:00:00.001Z') })]]));
    await expectSourceStale(financeReceivableReader.read(tx, businessId, cut));
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it.each(['not-a-cut', '2026-02-30T11:00:00Z', '2026-10-05T11:00:00', '2026-10-05T12:00:00.001Z'])('rejects malformed or future cut %s before public reads', async input => {
    await expect(readFinanceBookingPricing(tx, businessId, input)).rejects.toBeInstanceOf(FinanceInputError);
    expect(bookingsPort).not.toHaveBeenCalled();
    expect(pricingPort).not.toHaveBeenCalled();
  });

  it.each([{ businessId: 'other-business' }, { currency: 'USD' }])('preserves own-tenant PYG pricing checks: %j', async changes => {
    pricingPort.mockResolvedValue(new Map([[bookingId, price(changes)]]));
    await expect(financeReceivableReader.read(tx, businessId, cut)).rejects.toBeInstanceOf(FinanceConflictError);
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it('rejects Booking evidence returned for another tenant', async () => {
    bookingsPort.mockResolvedValue([booking({ businessId: 'other-business' })]);
    await expect(financeReceivableReader.read(tx, businessId, cut)).rejects.toBeInstanceOf(FinanceConflictError);
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it('rejects pricing returned for a different Booking even under the requested map key', async () => {
    pricingPort.mockResolvedValue(new Map([[bookingId, price({ bookingId: 'other-booking' })]]));
    await expect(financeReceivableReader.read(tx, businessId, cut)).rejects.toBeInstanceOf(FinanceConflictError);
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it('cannot silently treat an invalid Booking timestamp as an old source', async () => {
    bookingsPort.mockResolvedValue([booking({ bookingUpdatedAt: 'invalid-timestamp' })]);
    await expectSourceStale(financeReceivableReader.read(tx, businessId, cut));
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it('cannot silently treat an invalid native pricing Date as an old source', async () => {
    pricingPort.mockResolvedValue(new Map([[bookingId, price({ createdAt: new Date(Number.NaN) })]]));
    await expectSourceStale(financeReceivableReader.read(tx, businessId, cut));
    expect(paymentPort).not.toHaveBeenCalled();
  });

  it('preserves missing-price coverage without reporting a fabricated zero receivable', async () => {
    pricingPort.mockResolvedValue(new Map());
    const result = await financeReceivableReader.read(tx, businessId, cut);
    expect(result.rows).toEqual([]);
    expect(result.credits).toEqual([]);
    expect(result.reviewBookingIds).toEqual([bookingId]);
  });

  it('uses current public Payment provenance before the same normalized cut obligation snapshot',async()=>{
    await financeReceivableReader.read(tx,businessId,'2026-10-05T08:00:00-03:00');
    expect(paymentPort.mock.calls.map(call=>call[2].toISOString())).toEqual([now,cut]);
    expect(paymentPort.mock.calls.every(call=>call[0]===native&&call[1]===businessId)).toBe(true);
  });
  it.each([
    {name:'backdated payment',paidAt:'2026-10-01T00:00:00.000Z',createdAt:'2026-10-05T11:00:00.001Z'},
    {name:'recorded future payment',paidAt:'2026-10-06T00:00:00.000Z',createdAt:'2026-10-01T01:00:00.000Z'},
  ])('rejects $name before reading the obligation cut instead of silently reducing debt',async({paidAt,createdAt})=>{
    const basis=obligations();paymentPort.mockResolvedValue({...paymentSource(),payload:{payments:basis.payments.map(row=>({...row,businessId,paidAt,createdAt})),adjustments:[]}});
    await expectSourceStale(financeReceivableReader.read(tx,businessId,cut));expect(paymentPort).toHaveBeenCalledTimes(1);
  });
  it.each([
    {name:'later VOID applies to original paidAt',kind:'VOID',occurredAt:now,createdAt:now},
    {name:'later backdated refund',kind:'REFUND',occurredAt:'2026-10-01T02:00:00.000Z',createdAt:now},
    {name:'recorded future refund',kind:'REFUND',occurredAt:'2026-10-06T00:00:00.000Z',createdAt:'2026-10-01T02:00:00.000Z'},
  ])('rejects $name before returning pending debt',async({kind,occurredAt,createdAt})=>{
    const current=paymentSource(),payload=financeJsonRecord(current.payload);paymentPort.mockResolvedValue({...current,payload:{payments:payload.payments,adjustments:[{id:'adjustment',businessId,paymentId:'payment',kind,occurredAt,createdAt}]}});
    await expectSourceStale(financeReceivableReader.read(tx,businessId,cut));expect(paymentPort).toHaveBeenCalledTimes(1);
  });
});
