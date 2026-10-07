import { InvalidBookingInputError } from '../../booking/booking.contract';
import { amendmentChanges, amendmentExpectation, type BookingAmendmentInput } from './booking-amendment.validation';

const scope = { businessId: '11111111-1111-4111-8111-111111111111', bookingId: '22222222-2222-4222-8222-222222222222', actorUserId: '33333333-3333-4333-8333-333333333333' };
const quote = { currency: 'PYG', totalAmountMinor: 0, items: [], fingerprint: 'a'.repeat(64) };
const accepted = { ...scope, expectedUpdatedAt: '2026-10-02T10:00:00.000Z', currentPricingId: '44444444-4444-4444-8444-444444444444', expectedPaidAmountMinor: 0, acceptedQuote: quote };

describe('Booking amendment optimistic validation', () => {
  it('preserves omitted pricing/reason and normalizes only explicit contact details', () => {
    expect(amendmentChanges({ ...scope, notes: '  Observación  ', adults: null })).toEqual({ notes: 'Observación', adults: null, reason: null });
    expect(amendmentChanges({ ...scope, reason: '  Cambio solicitado  ' })).toEqual({ reason: 'Cambio solicitado' });
  });

  it.each([
    { reason: '' }, { reason: null }, { reason: 'a' }, { reason: 'a'.repeat(501) },
    { checkInDate: null }, { checkOutDate: '2026-02-30' }, { contactId: null },
    { adults: -1 }, { children: 0.5 }, { notes: 'a'.repeat(1001) },
    { checkInDate: '2026-12-20', checkOutDate: '2026-12-19' },
  ])('rejects invalid change input %#', (change) => {
    expect(() => amendmentChanges({ ...scope, ...change })).toThrow(InvalidBookingInputError);
  });

  it('requires exact observed version, price id and safely represented payments', () => {
    expect(amendmentExpectation(accepted)).toEqual({ expectedUpdatedAt: accepted.expectedUpdatedAt, currentPricingId: accepted.currentPricingId, expectedPaidAmountMinor: 0, acceptedQuote: quote });
  });

  it.each([
    { expectedUpdatedAt: undefined }, { expectedUpdatedAt: '2026-10-02T10:00:00Z' }, { expectedUpdatedAt: 'bad' },
    { currentPricingId: 'not-an-id' }, { expectedPaidAmountMinor: -1 }, { expectedPaidAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { acceptedQuote: undefined }, { acceptedQuote: { ...quote, totalAmountMinor: 0.5 } },
    { acceptedQuote: { ...quote, totalAmountMinor: -1 } }, { acceptedQuote: { ...quote, fingerprint: 'client-price' } },
  ])('rejects incomplete or manipulated preview expectations %#', (expectation) => {
    const input = { ...accepted, ...expectation } as BookingAmendmentInput;
    expect(() => amendmentExpectation(input)).toThrow(InvalidBookingInputError);
  });
});
