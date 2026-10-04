CREATE TYPE "IntegrationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

ALTER TABLE "IntegrationOutboxEvent"
  ADD COLUMN "status" "IntegrationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "processedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "processingToken" TEXT;

CREATE INDEX "IntegrationOutboxEvent_status_availableAt_createdAt_eventId_idx"
  ON "IntegrationOutboxEvent"("status", "availableAt", "createdAt", "eventId");
