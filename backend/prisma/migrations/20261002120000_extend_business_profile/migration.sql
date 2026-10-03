ALTER TABLE "Business"
    ADD COLUMN "country" TEXT,
    ADD COLUMN "region" TEXT,
    ADD COLUMN "city" TEXT,
    ADD COLUMN "address" TEXT;

CREATE TABLE "BusinessProfileAudit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beforeData" JSONB NOT NULL,
    "afterData" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "BusinessProfileAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BusinessProfileAudit_businessId_occurredAt_id_idx" ON "BusinessProfileAudit"("businessId", "occurredAt", "id");
ALTER TABLE "BusinessProfileAudit" ADD CONSTRAINT "BusinessProfileAudit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessProfileAudit" ADD CONSTRAINT "BusinessProfileAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
