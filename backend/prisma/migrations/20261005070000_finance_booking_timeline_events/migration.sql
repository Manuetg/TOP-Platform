-- Conserva el catálogo existente y admite hechos financieros registrados, sin
-- cambiar importes ni reescribir eventos históricos de Booking.
BEGIN;
ALTER TABLE "BookingTimelineEvent" DROP CONSTRAINT "BookingTimelineEvent_type_check";
ALTER TABLE "BookingTimelineEvent" ADD CONSTRAINT "BookingTimelineEvent_type_check" CHECK ("type" IN (
  'BOOKING_CREATED', 'BOOKING_SUBMITTED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED',
  'BOOKING_AMENDED', 'BOOKING_CHECKED_IN', 'BOOKING_CHECKED_OUT', 'BOOKING_MARKED_NO_SHOW',
  'PAYMENT_VOID_RECORDED', 'PAYMENT_REFUND_RECORDED', 'BOOKING_FINAL_AMOUNT_CONFIRMED'
));
COMMIT;
