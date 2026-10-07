-- Extensión aditiva del catálogo; no modifica eventos ni reservas históricas.
BEGIN;
ALTER TABLE "BookingTimelineEvent" DROP CONSTRAINT "BookingTimelineEvent_type_check";
ALTER TABLE "BookingTimelineEvent"
ADD CONSTRAINT "BookingTimelineEvent_type_check"
CHECK ("type" IN (
  'BOOKING_CREATED', 'BOOKING_SUBMITTED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED',
  'BOOKING_CHECKED_IN', 'BOOKING_CHECKED_OUT', 'BOOKING_MARKED_NO_SHOW', 'BOOKING_AMENDED'
));
COMMIT;
