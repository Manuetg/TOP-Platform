import type { Prisma } from '@prisma/client';
import { listFinanceServiceEvidence } from '../../booking/booking.contract';
import { readCurrentPricingClassifiedBatch, readServicePricingBatch, type ServicePricing } from '../../pricing/pricing.contract';
import { readEffectivePayments, readPaymentClosingSources, readRecordedPaymentsForFinance } from '../../payment/payment.contract';
import { readFinanceCorrections } from './prisma-finance-corrections.reader';

jest.mock('../../booking/booking.contract', () => ({ listFinanceServiceEvidence: jest.fn() }));
jest.mock('../../pricing/pricing.contract', () => ({ readCurrentPricingClassifiedBatch: jest.fn(), readServicePricingBatch: jest.fn() }));
jest.mock('../../payment/payment.contract', () => ({ readEffectivePayments: jest.fn(), readPaymentClosingSources: jest.fn(), readRecordedPaymentsForFinance: jest.fn(), needsPaymentReconciliation: (price: { totalAmountMinor: number }, paid: number) => paid > price.totalAmountMinor, PAYMENT_RECONCILIATION_WARNING: 'Reconciliar' }));

const businessId = 'business'; const bookingId = 'booking';
const now = new Date('2026-10-05T10:00:00.000Z');

function fixture() {
  const booking = { businessId, bookingId, resourceIds: ['resource'], bookingUpdatedAt: '2026-10-01T10:00:00.000Z', checkInDate: '2026-10-01', checkOutDate: '2026-10-02', status: 'CANCELLED', checkInEventId: null, checkOutEventId: null };
  const price = { id: 'terminal', businessId, bookingId, originalSnapshotId: 'snapshot', pricingRevisionId: 'terminal', revisionNumber: 1, currency: 'PYG', totalAmountMinor: 100, items: [], createdAt: now, kind: 'TERMINAL_FINAL_AMOUNT' as const, sourceContext: {} };
  const service: ServicePricing = { ...price, id: 'snapshot', pricingRevisionId: null, revisionNumber: 0, totalAmountMinor: 400, kind: 'SERVICE', sourceKind: 'SNAPSHOT', items: [{ resourceId: 'resource', ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 400, suggestedAmountMinor: null, adjustmentAmountMinor: null, overrideReason: 'Acuerdo de servicio persistido', nights: 1, breakdown: [] }] };
  const payment = { paymentId: 'payment', businessId, bookingId, currency: 'PYG', grossRecordedAmountMinor: 400, voidedAmountMinor: 0, refundedAmountMinor: 200, netRetainedAmountMinor: 200, paymentVersion: 2 };
  const link = { paymentId: 'payment', accountId: 'account', version: 9 };
  const findLinks = jest.fn<Promise<typeof link[]>, [unknown]>().mockResolvedValue([link]);
  jest.mocked(listFinanceServiceEvidence).mockResolvedValue([booking]);
  jest.mocked(readCurrentPricingClassifiedBatch).mockResolvedValue(new Map([[bookingId, price]]));
  jest.mocked(readServicePricingBatch).mockResolvedValue(new Map([[bookingId, service]]));
  jest.mocked(readEffectivePayments).mockResolvedValue([payment]);
  jest.mocked(readRecordedPaymentsForFinance).mockResolvedValue([{ id: payment.paymentId, bookingId, amountMinor: 400, currency: 'PYG', paidAt: '2026-10-01T12:00:00.000Z', reference: 'private-reference', paymentVersion: 2 }]);
  jest.mocked(readPaymentClosingSources).mockResolvedValue({ payload: { paymentPlans: [], installments: [], applications: [] }, sourceRefs: [], sourceToken: 'source-token', complete: true });
  const tx = { financePaymentLink: { findMany: findLinks } } as unknown as Prisma.TransactionClient;
  return { booking, price, service, payment, link, tx, findLinks };
}

describe('Given public economic sources, when OWNER reads Finance corrections', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
  afterEach(() => jest.useRealTimers());

  it('then shows current terminal exigible amount, net credit and exact versions without private Payment references', async () => {
    const scope = fixture();
    const result = await readFinanceCorrections(scope.tx, businessId, 'America/Asuncion');
    expect(result.bookings[0]).toMatchObject({ financialVersion: 2, creditMinor: 100, outstandingMinor: 0, needsReconciliation: true, canSetTerminalFinalAmount: true, pricing: { kind: 'TERMINAL_FINAL_AMOUNT', currentPricingId: 'terminal', totalAmountMinor: 100 }, amounts: { grossRecordedAmountMinor: 400, refundedAmountMinor: 200, netRetainedAmountMinor: 200 } });
    expect(result.bookings[0].payments[0]).toMatchObject({ effectiveStatus: 'PARTIALLY_REFUNDED', paymentVersion: 2, voidAllowed: false, refundAvailableMinor: 200, accountLink: { accountId: 'account', version: 9 } });
    expect(JSON.stringify(result)).not.toContain('private-reference');
    expect(scope.findLinks).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId }, take: 5001 }));
    expect(listFinanceServiceEvidence).toHaveBeenCalledWith(scope.tx, expect.objectContaining({ businessId, from: '0001-01-01', to: '9999-12-31' }));
  });

  it('then keeps the token stable as only asOf advances, and changes it when a real link version changes', async () => {
    const scope = fixture(); const first = await readFinanceCorrections(scope.tx, businessId, 'America/Asuncion');
    jest.setSystemTime(new Date(now.getTime() + 60000));
    const later = await readFinanceCorrections(scope.tx, businessId, 'America/Asuncion');
    expect(later.asOf).not.toBe(first.asOf); expect(later.token).toBe(first.token);
    scope.link.version += 1;
    expect((await readFinanceCorrections(scope.tx, businessId, 'America/Asuncion')).token).not.toBe(first.token);
  });

  it('then requires one matching SERVICE resource before offering terminal final amount', async () => {
    const scope = fixture(); scope.service.items = [];
    expect((await readFinanceCorrections(scope.tx, businessId, 'America/Asuncion')).bookings[0].canSetTerminalFinalAmount).toBe(false);
  });

  it('then fails closed on a missing Booking/price or incomplete plan cut', async () => {
    const scope = fixture(); jest.mocked(readCurrentPricingClassifiedBatch).mockResolvedValue(new Map());
    await expect(readFinanceCorrections(scope.tx, businessId, 'America/Asuncion')).rejects.toThrow('persistido');
    fixture(); jest.mocked(readPaymentClosingSources).mockResolvedValue({ payload: {}, sourceRefs: [], sourceToken: 'token', complete: false });
    await expect(readFinanceCorrections(scope.tx, businessId, 'America/Asuncion')).rejects.toThrow('corte');
  });
});
