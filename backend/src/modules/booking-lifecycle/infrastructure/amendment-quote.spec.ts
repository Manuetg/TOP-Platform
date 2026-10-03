import { amendmentFinancialSummary, amendmentQuote, canonicalAmendmentJson } from './amendment-quote';

describe('Amendment quote acceptance and credit', () => {
  it('compares semantic JSON independently of object key order and binds the proposal to its booking context', () => {
    const price = { currency: 'PYG', totalAmountMinor: 10, items: [] };
    const first = amendmentQuote(price, { bookingId: 'a', notes: 'Aceptado' });
    const reordered = amendmentQuote({ items: [], totalAmountMinor: 10, currency: 'PYG' }, { notes: 'Aceptado', bookingId: 'a' });
    expect(first.fingerprint).toBe(reordered.fingerprint);
    expect(amendmentQuote(price, { bookingId: 'b', notes: 'Aceptado' }).fingerprint).not.toBe(first.fingerprint);
    expect(amendmentQuote(price, { bookingId: 'a', notes: 'Otro' }).fingerprint).not.toBe(first.fingerprint);
    expect(canonicalAmendmentJson([1, 2])).not.toBe(canonicalAmendmentJson([2, 1]));
  });

  it.each([[100, 0, 100, 0], [100, 40, 60, 0], [100, 100, 0, 0], [80, 100, 0, 20], [0, 1, 0, 1], [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER - 1, 0]])('shows exact outstanding/credit for total %p and paid %p', (total, paid, outstanding, credit) => {
    expect(amendmentFinancialSummary(total, paid)).toEqual({ totalAmountMinor: total, paidAmountMinor: paid, outstandingAmountMinor: outstanding, creditAmountMinor: credit });
  });
});
