CREATE TABLE "BookingTimelineEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorUserId" TEXT,
  "details" JSONB NOT NULL,
  CONSTRAINT "BookingTimelineEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingTimelineEvent_businessId_bookingId_occurredAt_id_idx" ON "BookingTimelineEvent"("businessId", "bookingId", "occurredAt", "id");
ALTER TABLE "BookingTimelineEvent" ADD CONSTRAINT "BookingTimelineEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingTimelineEvent" ADD CONSTRAINT "BookingTimelineEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
