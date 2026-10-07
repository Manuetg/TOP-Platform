CREATE UNIQUE INDEX "PricingSnapshot_id_businessId_bookingId_key" ON "PricingSnapshot"("id", "businessId", "bookingId");

CREATE TABLE "PricingRevision" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "originalSnapshotId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "totalAmountMinor" BIGINT NOT NULL,
  "items" JSONB NOT NULL,
  "previousPricing" JSONB NOT NULL,
  "beforeContext" JSONB NOT NULL,
  "afterContext" JSONB NOT NULL,
  "paidAmountMinorAtSave" BIGINT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PricingRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PricingRevision_revision_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "PricingRevision_amount_check" CHECK ("totalAmountMinor" >= 0 AND "totalAmountMinor" <= 9007199254740991 AND "paidAmountMinorAtSave" >= 0 AND "paidAmountMinorAtSave" <= 9007199254740991),
  CONSTRAINT "PricingRevision_reason_check" CHECK ("reason" IS NULL OR char_length(btrim("reason")) BETWEEN 2 AND 500)
);

CREATE UNIQUE INDEX "PricingRevision_bookingId_revisionNumber_key" ON "PricingRevision"("bookingId", "revisionNumber");
CREATE INDEX "PricingRevision_businessId_bookingId_revisionNumber_idx" ON "PricingRevision"("businessId", "bookingId", "revisionNumber");
ALTER TABLE "PricingRevision" ADD CONSTRAINT "PricingRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingRevision" ADD CONSTRAINT "PricingRevision_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingRevision" ADD CONSTRAINT "PricingRevision_originalSnapshotId_businessId_bookingId_fkey" FOREIGN KEY ("originalSnapshotId", "businessId", "bookingId") REFERENCES "PricingSnapshot"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingRevision" ADD CONSTRAINT "PricingRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_pricing_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PricingRevision is append-only';
END;
$$;
CREATE TRIGGER "PricingRevision_append_only" BEFORE UPDATE OR DELETE ON "PricingRevision" FOR EACH ROW EXECUTE FUNCTION prevent_pricing_revision_mutation();

ALTER TABLE "BookingTimelineEvent" DROP CONSTRAINT "BookingTimelineEvent_type_check";
ALTER TABLE "BookingTimelineEvent" ADD CONSTRAINT "BookingTimelineEvent_type_check" CHECK ("type" IN (
  'BOOKING_CREATED', 'BOOKING_SUBMITTED', 'BOOKING_CONFIRMED', 'BOOKING_CANCELLED',
  'BOOKING_AMENDED', 'BOOKING_CHECKED_IN', 'BOOKING_CHECKED_OUT', 'BOOKING_MARKED_NO_SHOW'
));
