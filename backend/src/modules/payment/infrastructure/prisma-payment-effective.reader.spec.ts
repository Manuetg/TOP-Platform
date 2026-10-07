import type { Prisma } from '@prisma/client';
import { PaymentAdjustmentInvariantError } from '../domain/payment-adjustment.rules';
import { readEffectiveApplications, readEffectivePayments, summarizeEffectivePayments } from './prisma-payment-effective.reader';

const raw = jest.fn();
const transaction = { $queryRaw: raw } as unknown as Prisma.TransactionClient;
const state = { paymentId: 'payment', businessId: 'business', bookingId: 'booking', currency: 'PYG', grossRecordedAmountMinor: 1000n, voidedAmountMinor: 0n, refundedAmountMinor: 200n, netRetainedAmountMinor: 800n, paymentVersion: 2n, invalidMonetaryData: false, applicationInvalid: false };

beforeEach(() => raw.mockReset());

describe('canonical Payment view adapters', () => {
  it('Given partial refund When reading Then returns gross and net separately with original version', async () => {
    raw.mockResolvedValue([state]);
    const payments = await readEffectivePayments(transaction, 'business', ['booking']);
    expect(payments).toEqual([{ paymentId: 'payment', businessId: 'business', bookingId: 'booking', currency: 'PYG', grossRecordedAmountMinor: 1000, voidedAmountMinor: 0, refundedAmountMinor: 200, netRetainedAmountMinor: 800, paymentVersion: 2 }]);
    expect(summarizeEffectivePayments(payments, 'PYG')).toEqual({ grossRecordedAmountMinor: 1000, voidedAmountMinor: 0, refundedAmountMinor: 200, netRetainedAmountMinor: 800, financialVersion: 2 });
  });

  it('Given no originals When reading Then returns safe zero amounts/version without SQL for empty batch', async () => {
    expect(await readEffectivePayments(transaction, 'business', [])).toEqual([]);
    expect(raw).not.toHaveBeenCalled();
    expect(summarizeEffectivePayments([], 'PYG')).toEqual({ grossRecordedAmountMinor: 0, voidedAmountMinor: 0, refundedAmountMinor: 0, netRetainedAmountMinor: 0, financialVersion: 0 });
  });

  it('Given one original voided When reading Then preserves its row and financial version', async () => {
    raw.mockResolvedValue([{ ...state, voidedAmountMinor: 1000n, refundedAmountMinor: 0n, netRetainedAmountMinor: 0n }]);
    const [payment] = await readEffectivePayments(transaction, 'business', ['booking']);
    expect(payment).toMatchObject({ grossRecordedAmountMinor: 1000, voidedAmountMinor: 1000, netRetainedAmountMinor: 0, paymentVersion: 2 });
  });

  it.each([{ invalidMonetaryData: true }, { applicationInvalid: true }, { grossRecordedAmountMinor: 0n }, { netRetainedAmountMinor: -1n }, { netRetainedAmountMinor: 1001n }, { refundedAmountMinor: -1n }, { voidedAmountMinor: -1n }, { paymentVersion: 0n }])('Given impossible per-original state %p Then fails closed', async (invalid) => {
    raw.mockResolvedValue([{ ...state, ...invalid }]);
    await expect(readEffectivePayments(transaction, 'business', ['booking'])).rejects.toThrow(PaymentAdjustmentInvariantError);
  });

  it('rejects unsafe amounts and sum overflow, including counters, without a clamp', async () => {
    raw.mockResolvedValue([{ ...state, grossRecordedAmountMinor: 9007199254740992n }]);
    await expect(readEffectivePayments(transaction, 'business', ['booking'])).rejects.toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
    raw.mockResolvedValue([state]);
    const [payment] = await readEffectivePayments(transaction, 'business', ['booking']);
    expect(() => summarizeEffectivePayments([{ ...payment, grossRecordedAmountMinor: Number.MAX_SAFE_INTEGER }, payment], 'PYG')).toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
    expect(() => summarizeEffectivePayments([{ ...payment, paymentVersion: Number.MAX_SAFE_INTEGER }, payment], 'PYG')).toThrow('MONEY_AMOUNT_UNSAFE_INTEGER');
    expect(() => summarizeEffectivePayments([payment], 'USD')).toThrow(PaymentAdjustmentInvariantError);
  });

  it('Given original application100/reversal40 When reading Then returns effective60 and original unchanged', async () => {
    raw.mockResolvedValue([{ paymentId: 'payment', installmentId: 'installment', originalAmountMinor: 100n, reversedAmountMinor: 40n, effectiveAmountMinor: 60n, dueDate: null, sortOrder: 0, invalidMonetaryData: false, scoped: true }]);
    expect(await readEffectiveApplications(transaction, 'business', 'booking', 'payment')).toEqual([{ paymentId: 'payment', installmentId: 'installment', originalAmountMinor: 100, reversedAmountMinor: 40, effectiveAmountMinor: 60, dueDate: null, sortOrder: 0 }]);
  });

  it.each([{ scoped: false }, { invalidMonetaryData: true }, { originalAmountMinor: 0n }, { reversedAmountMinor: -1n }, { effectiveAmountMinor: -1n }, { effectiveAmountMinor: 101n }])('Given impossible application %p Then fails closed', async (invalid) => {
    raw.mockResolvedValue([{ paymentId: 'payment', installmentId: 'installment', originalAmountMinor: 100n, reversedAmountMinor: 0n, effectiveAmountMinor: 100n, dueDate: null, sortOrder: 0, invalidMonetaryData: false, scoped: true, ...invalid }]);
    await expect(readEffectiveApplications(transaction, 'business', 'booking')).rejects.toThrow(PaymentAdjustmentInvariantError);
  });
});
