import type { Prisma } from '@prisma/client';

export interface BookingFinanceTimelineInput {
  businessId: string;
  bookingId: string;
  actorUserId: string;
  type: 'PAYMENT_VOID_RECORDED' | 'PAYMENT_REFUND_RECORDED' | 'BOOKING_FINAL_AMOUNT_CONFIRMED';
  details: { paymentId: string; adjustmentId: string } | { revisionId: string };
}

/** Booking readers may be broader than Finance readers. Persist only safe event IDs. */
export async function appendBookingTimelineEvent(transaction: Prisma.TransactionClient, input: BookingFinanceTimelineInput): Promise<void> {
  const details = publicDetails(input);
  await transaction.bookingTimelineEvent.create({ data: { businessId: input.businessId, bookingId: input.bookingId, actorUserId: input.actorUserId, type: input.type, details } });
}

function publicDetails(input: BookingFinanceTimelineInput): Prisma.InputJsonObject {
  if (input.type === 'BOOKING_FINAL_AMOUNT_CONFIRMED' && 'revisionId' in input.details && input.details.revisionId) return { revisionId: input.details.revisionId };
  if (['PAYMENT_VOID_RECORDED', 'PAYMENT_REFUND_RECORDED'].includes(input.type) && 'paymentId' in input.details && input.details.paymentId && input.details.adjustmentId) return { paymentId: input.details.paymentId, adjustmentId: input.details.adjustmentId };
  throw new Error('BOOKING_FINANCE_TIMELINE_INVALID_EVENT');
}
