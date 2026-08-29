ALTER TABLE "BookingTimelineEvent"
ADD CONSTRAINT "BookingTimelineEvent_type_check"
CHECK ("type" IN ('BOOKING_CREATED', 'BOOKING_SUBMITTED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED'));

CREATE UNIQUE INDEX "Booking_id_businessId_key" ON "Booking"("id", "businessId");

ALTER TABLE "BookingTimelineEvent" DROP CONSTRAINT "BookingTimelineEvent_bookingId_fkey";

ALTER TABLE "BookingTimelineEvent"
ADD CONSTRAINT "BookingTimelineEvent_bookingId_businessId_fkey"
FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId")
ON DELETE RESTRICT ON UPDATE CASCADE;
