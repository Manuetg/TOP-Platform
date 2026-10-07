import { Logger } from '@nestjs/common';
import { readCurrentPricing, type CurrentPricing } from '../../pricing/pricing.contract';
import { PaymentAdjustmentInvariantError } from '../domain/payment-adjustment.rules';
import { GetOutstandingBalanceUseCase, OutstandingBalanceConflictError, OutstandingBalanceInvariantError } from '../application/get-outstanding-balance.use-case';
import { PAYMENT_RECONCILIATION_WARNING } from '../domain/financial-reconciliation';
import { PrismaOutstandingBalanceRepository } from './prisma-outstanding-balance.repository';

jest.mock('../../pricing/pricing.contract', () => ({ ...jest.requireActual<typeof import('../../pricing/pricing.contract')>('../../pricing/pricing.contract'), readCurrentPricing: jest.fn() }));

const businessId = 'business'; const bookingId = 'booking';
const input = { businessId, bookingId, businessLocalDate: '2026-10-04' };
const price: CurrentPricing = { id: 'terminal-price', originalSnapshotId: 'original-snapshot', pricingRevisionId: 'terminal-price', revisionNumber: 2, businessId, bookingId, currency: 'PYG', totalAmountMinor: 600, items: [], createdAt: new Date('2026-10-03') };
const effective = { paymentId: 'payment', businessId, bookingId, currency: 'PYG', grossRecordedAmountMinor: 1000n, voidedAmountMinor: 0n, refundedAmountMinor: 250n, netRetainedAmountMinor: 750n, paymentVersion: 2n, invalidMonetaryData: false, applicationInvalid: false };
const noPlan = { paymentPlanId: null, planCurrency: null, paymentCurrencyMismatch: false, invalidMonetaryData: false, paidAmountMinor: 750n, planTotalAmountMinor: null, installmentTotalAmountMinor: 0n, appliedAmountMinor: 0n, overdueAmountMinor: 0n, nextDueDate: null, nextDueAmountMinor: null };
type BalanceRow = Omit<typeof noPlan, 'paymentPlanId' | 'planCurrency' | 'planTotalAmountMinor' | 'nextDueDate' | 'nextDueAmountMinor'> & { paymentPlanId: string | null; planCurrency: string | null; planTotalAmountMinor: bigint | null; nextDueDate: Date | null; nextDueAmountMinor: bigint | null };

function fixture() {
  const state: { effective: typeof effective[]; balance: BalanceRow[] } = { effective: [{ ...effective }], balance: [{ ...noPlan }] };
  const raw = jest.fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>().mockImplementation(query => Promise.resolve(query.join('?').includes('WITH selected_plan AS') ? state.balance : state.effective));
  const transaction = { $queryRaw: raw };
  const run = jest.fn((callback: (tx: typeof transaction) => Promise<unknown>, _options: unknown) => { void _options; return callback(transaction); });
  const repository = new PrismaOutstandingBalanceRepository({ $transaction: run } as never);
  const findBusiness = jest.fn().mockResolvedValue({ timezone: 'America/Asuncion' });
  const findBooking = jest.fn().mockResolvedValue({ id: bookingId, businessId });
  const findSnapshot = jest.fn().mockResolvedValue({ id: 'original-snapshot', businessId, bookingId, currency: 'PYG', totalAmountMinor: 1000, items: [], createdAt: new Date('2026-09-01') });
  const useCase = new GetOutstandingBalanceUseCase(repository, { findByIdAndBusinessId: findBooking } as never, { findByBookingId: findSnapshot } as never, { findById: findBusiness } as never);
  return { state, raw, transaction, run, repository, useCase, findBusiness, findBooking, findSnapshot };
}

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date('2026-10-05T02:00:00.000Z')); jest.mocked(readCurrentPricing).mockResolvedValue({ ...price }); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('PrismaOutstandingBalanceRepository canonical financial bindings', () => {
  it('returns original1000/refund250/net750 and exact literal tenant/Booking/date sources in one RepeatableRead transaction', async () => {
    const f = fixture();
    await expect(f.repository.calculate(input)).resolves.toEqual({ currentCurrency: 'PYG', currentTotalAmountMinor: 600, currentPricingRevisionId: 'terminal-price', ...noPlan, paidAmountMinor: 750, planTotalAmountMinor: null, installmentTotalAmountMinor: 0, appliedAmountMinor: 0, overdueAmountMinor: 0, nextDueAmountMinor: null, grossRecordedAmountMinor: 1000, voidedAmountMinor: 0, refundedAmountMinor: 250, netRetainedAmountMinor: 750, financialVersion: 2 });
    expect(f.run).toHaveBeenCalledTimes(1); expect(f.run).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(readCurrentPricing).toHaveBeenCalledWith(f.transaction, businessId, bookingId);
    expect(f.raw).toHaveBeenCalledTimes(2);
    expect(f.raw.mock.calls[0].slice(1)).toEqual([businessId, [bookingId], null, null]);
    expect(f.raw.mock.calls[1].slice(1)).toEqual([businessId, bookingId, 'PYG', businessId, bookingId, 'PYG', businessId, bookingId, input.businessLocalDate]);
    const sql = f.raw.mock.calls[1][0].join('?');
    expect(sql).toContain('SUM("netRetainedAmountMinor")'); expect(sql).toContain('FROM "PaymentApplicationEffective" application');
    expect(sql).toContain('"dueDate" < CAST(? AS date)'); expect(sql).toContain('ORDER BY "dueDate" ASC, "sortOrder" ASC, id ASC');
  });

  it('feeds the real use-case: final600 and retained750 produce credit150 rather than an extra negative refund or historical snapshot1000', async () => {
    const f = fixture();
    await expect(f.useCase.execute(businessId, bookingId)).resolves.toEqual({ bookingId, currency: 'PYG', totalAmountMinor: 600, paidAmountMinor: 750, grossRecordedAmountMinor: 1000, voidedAmountMinor: 0, refundedAmountMinor: 250, netRetainedAmountMinor: 750, financialVersion: 2, outstandingAmountMinor: 0, creditAmountMinor: 150, needsReconciliation: true, warning: PAYMENT_RECONCILIATION_WARNING, overdueAmountMinor: null, financialStatus: 'PAID', nextDueDate: null, nextDueAmountMinor: null });
    expect(f.findBusiness).toHaveBeenCalledWith(businessId); expect(f.findBooking).toHaveBeenCalledWith(bookingId, businessId); expect(f.findSnapshot).toHaveBeenCalledWith(bookingId);
    expect(f.raw.mock.calls[1].slice(1).at(-1)).toBe('2026-10-04');
  });

  it('preserves an obsolete plan and effective applied750 but suppresses its due claims with the reconciliation warning', async () => {
    const f = fixture(); f.state.balance = [{ ...noPlan, paymentPlanId: 'old-plan', planCurrency: 'PYG', planTotalAmountMinor: 1000n, installmentTotalAmountMinor: 1000n, appliedAmountMinor: 750n, overdueAmountMinor: 250n, nextDueDate: new Date('2026-10-03'), nextDueAmountMinor: 250n }];
    await expect(f.useCase.execute(businessId, bookingId)).resolves.toMatchObject({ totalAmountMinor: 600, paidAmountMinor: 750, creditAmountMinor: 150, outstandingAmountMinor: 0, needsReconciliation: true, warning: PAYMENT_RECONCILIATION_WARNING, overdueAmountMinor: null, nextDueDate: null, nextDueAmountMinor: null });
    expect((await f.repository.calculate(input)).appliedAmountMinor).toBe(750);
  });

  it('retains a VOID original while reporting zero paid and unpaid final600', async () => {
    const f = fixture(); f.state.effective = [{ ...effective, voidedAmountMinor: 1000n, refundedAmountMinor: 0n, netRetainedAmountMinor: 0n }]; f.state.balance = [{ ...noPlan, paidAmountMinor: 0n }];
    await expect(f.useCase.execute(businessId, bookingId)).resolves.toMatchObject({ grossRecordedAmountMinor: 1000, voidedAmountMinor: 1000, refundedAmountMinor: 0, netRetainedAmountMinor: 0, financialVersion: 2, paidAmountMinor: 0, outstandingAmountMinor: 600, creditAmountMinor: 0, financialStatus: 'UNPAID' });
  });

  it('rejects a missing current price before either canonical SQL query', async () => {
    const f = fixture(); jest.mocked(readCurrentPricing).mockResolvedValue(null);
    await expect(f.repository.calculate(input)).rejects.toBeInstanceOf(OutstandingBalanceConflictError); expect(f.raw).not.toHaveBeenCalled();
  });

  it.each([{ currency: 'USD' }, { invalidMonetaryData: true }, { applicationInvalid: true }, { netRetainedAmountMinor: -1n }, { paymentVersion: 0n }])('rejects invalid effective source %p before the plan query', async invalid => {
    const f = fixture(); f.state.effective = [{ ...effective, ...invalid }];
    await expect(f.repository.calculate(input)).rejects.toBeInstanceOf(PaymentAdjustmentInvariantError); expect(f.raw).toHaveBeenCalledTimes(1);
  });

  it.each([{ paymentCurrencyMismatch: true }, { invalidMonetaryData: true }])('preserves the SQL flag %p for rejection by the real use-case', async invalid => {
    const f = fixture(); f.state.balance = [{ ...noPlan, ...invalid }]; jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(f.repository.calculate(input)).resolves.toMatchObject(invalid);
    await expect(f.useCase.execute(businessId, bookingId)).rejects.toBeInstanceOf(OutstandingBalanceInvariantError);
  });

  it('rejects a missing plan aggregate row instead of returning fabricated zero', async () => { const f = fixture(); f.state.balance = []; await expect(f.repository.calculate(input)).rejects.toThrow('OUTSTANDING_BALANCE_QUERY_EMPTY'); });

  it.each(['paidAmountMinor', 'planTotalAmountMinor', 'installmentTotalAmountMinor', 'appliedAmountMinor', 'overdueAmountMinor', 'nextDueAmountMinor'] as const)('rejects unsafe SQL aggregate %s before rounded public output', async key => {
    const f = fixture(); f.state.balance = [{ ...noPlan, [key]: BigInt(Number.MAX_SAFE_INTEGER) + 1n }];
    await expect(f.repository.calculate(input)).rejects.toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
  });
});
