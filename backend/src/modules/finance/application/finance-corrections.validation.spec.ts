import { FinanceInputError } from '../domain/finance.errors';
import { parsePaymentAdjustmentCommand, parseTerminalPricingCommand } from './finance-corrections.validation';

const bookingId = '11111111-1111-4111-8111-111111111111';
const paymentId = '22222222-2222-4222-8222-222222222222';
const currentPricingId = '33333333-3333-4333-8333-333333333333';
const accountId = '44444444-4444-4444-8444-444444444444';
const base = () => ({ bookingId, expectedBookingUpdatedAt: '2026-10-01T10:00:00-03:00', currentPricingId, expectedFinancialVersion: 1, reason: ' Confirmación manual ' });
const voidCommand = () => ({ ...base(), type: 'VOID_PAYMENT', paymentId, expectedPaymentVersion: 1 });
const refund = () => ({ ...voidCommand(), type: 'REFUND_PAYMENT', amountMinor: 100, occurredAt: '2026-10-01T11:00:00-03:00', accountId, expectedAccountVersion: 1, reference: null });
const terminal = () => ({ ...base(), type: 'SET_TERMINAL_FINAL_AMOUNT', finalAmountMinor: 0 });

describe('Given a correction body, when strict Finance validation runs', () => {
  it('then normalizes only explicit text/UUID/date fields and permits a zero final amount', () => {
    expect(parsePaymentAdjustmentCommand(voidCommand())).toMatchObject({ reason: 'Confirmación manual', expectedBookingUpdatedAt: '2026-10-01T13:00:00.000Z' });
    expect(parsePaymentAdjustmentCommand({ ...refund(), reference: ' referencia ' })).toMatchObject({ occurredAt: '2026-10-01T14:00:00.000Z', reference: 'referencia' });
    expect(parseTerminalPricingCommand(terminal()).finalAmountMinor).toBe(0);
  });

  it.each(['amountMinor', 'occurredAt', 'accountId', 'reference', 'currency', 'businessId', 'actorUserId', 'requestId', 'kind'])('then rejects %s in VOID instead of trusting caller economic fields', (field) => {
    expect(() => parsePaymentAdjustmentCommand({ ...voidCommand(), [field]: 'forged' })).toThrow(FinanceInputError);
  });

  it.each(['businessId', 'actorUserId', 'currency', 'requestId', 'bookingStatus', 'grossRecordedAmountMinor'])('then rejects caller %s in REFUND and final amount', (field) => {
    expect(() => parsePaymentAdjustmentCommand({ ...refund(), [field]: 'forged' })).toThrow(FinanceInputError);
    expect(() => parseTerminalPricingCommand({ ...terminal(), [field]: 'forged' })).toThrow(FinanceInputError);
  });

  it.each([0, -1, 0.5, 9007199254740992, NaN, Infinity, '100', null, undefined])('then rejects invalid refund money %s', (amountMinor) => {
    expect(() => parsePaymentAdjustmentCommand({ ...refund(), amountMinor })).toThrow(FinanceInputError);
  });

  it.each([-1, 0.5, 9007199254740992, NaN, Infinity, '0', null, undefined])('then rejects invalid final money %s', (finalAmountMinor) => {
    expect(() => parseTerminalPricingCommand({ ...terminal(), finalAmountMinor })).toThrow(FinanceInputError);
  });

  it.each(['expectedPaymentVersion', 'expectedAccountVersion'])('then requires an explicit positive %s', (field) => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined]) expect(() => parsePaymentAdjustmentCommand({ ...refund(), [field]: value })).toThrow(FinanceInputError);
  });

  it.each([-1, 0.1, '1', undefined, Number.MAX_SAFE_INTEGER + 1])('then requires a safe nonnegative financial CAS %s', (expectedFinancialVersion) => {
    expect(() => parseTerminalPricingCommand({ ...terminal(), expectedFinancialVersion })).toThrow(FinanceInputError);
  });

  it.each(['2026-02-30T12:00:00Z', '2026-10-01T24:00:00Z', '2026-10-01T12:60:00Z', '2026-10-01T12:00:60Z', '2026-10-01T12:00:00', '2026-10-01T12:00:00+24:00', '2026-10-01T12:00:00.0001Z', '0000-01-01T12:00:00Z'])('then rejects invalid calendar/offset precision %s', (value) => {
    expect(() => parsePaymentAdjustmentCommand({ ...refund(), occurredAt: value })).toThrow(FinanceInputError);
    expect(() => parseTerminalPricingCommand({ ...terminal(), expectedBookingUpdatedAt: value })).toThrow(FinanceInputError);
  });

  it('then rejects prototype, array, symbol and missing required reference fields', () => {
    const inherited: unknown = Object.assign(Object.create({ malicious: true }) as object, refund());
    expect(() => parsePaymentAdjustmentCommand(inherited)).toThrow(FinanceInputError);
    expect(() => parsePaymentAdjustmentCommand([])).toThrow(FinanceInputError);
    expect(() => parsePaymentAdjustmentCommand({ ...refund(), [Symbol('hidden')]: 1 })).toThrow(FinanceInputError);
    const { reference, ...withoutReference } = refund(); void reference;
    expect(() => parsePaymentAdjustmentCommand(withoutReference)).toThrow(FinanceInputError);
    expect(() => parsePaymentAdjustmentCommand({ ...refund(), reference: 'x'.repeat(121) })).toThrow(FinanceInputError);
    expect(() => parseTerminalPricingCommand({ ...terminal(), reason: 'x' })).toThrow(FinanceInputError);
  });

  it('then keeps operation namespaces explicit and rejects a type routed to the wrong parser', () => {
    expect(() => parseTerminalPricingCommand(refund())).toThrow(FinanceInputError);
    expect(() => parsePaymentAdjustmentCommand(terminal())).toThrow(FinanceInputError);
    expect(() => parsePaymentAdjustmentCommand({ ...voidCommand(), type: 'PAYMENT_RECORD' })).toThrow(FinanceInputError);
  });
});
