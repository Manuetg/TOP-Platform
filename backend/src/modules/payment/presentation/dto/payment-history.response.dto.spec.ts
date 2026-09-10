import { PaymentMethod, PaymentStatus, type Payment } from '../../domain/payment';
import { PaymentHistoryItemResponseDto } from './payment-history.response.dto';

describe('PaymentHistoryItemResponseDto', () => {
  it('maps only the approved public Payment fields', () => {
    const internal: Payment = {
      id: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
      bookingId: '33333333-3333-4333-8333-333333333333',
      amountMinor: 250000,
      currency: 'PYG',
      method: PaymentMethod.CARD,
      reference: null,
      note: 'Pago externo',
      paidAt: new Date('2026-09-09T18:00:00.000Z'),
      createdAt: new Date('2026-09-09T18:01:00.000Z'),
      recordedByUserId: '44444444-4444-4444-8444-444444444444',
      status: PaymentStatus.RECORDED,
      idempotencyKey: 'private-key',
      requestFingerprint: 'private-fingerprint',
    };
    expect(PaymentHistoryItemResponseDto.fromDomain(internal)).toEqual({
      id: internal.id,
      bookingId: internal.bookingId,
      amountMinor: internal.amountMinor,
      currency: internal.currency,
      method: internal.method,
      reference: internal.reference,
      note: internal.note,
      paidAt: internal.paidAt.toISOString(),
      createdAt: internal.createdAt.toISOString(),
      recordedByUserId: internal.recordedByUserId,
      status: internal.status,
    });
  });
});
