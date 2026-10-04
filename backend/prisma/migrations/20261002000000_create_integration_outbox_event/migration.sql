CREATE TABLE "IntegrationOutboxEvent" (
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadVersion" INTEGER NOT NULL,
  "businessId" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "correlationId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationOutboxEvent_pkey" PRIMARY KEY ("eventId")
);

CREATE INDEX "IntegrationOutboxEvent_businessId_createdAt_eventId_idx"
ON "IntegrationOutboxEvent"("businessId", "createdAt", "eventId");

CREATE INDEX "IntegrationOutboxEvent_eventType_createdAt_eventId_idx"
ON "IntegrationOutboxEvent"("eventType", "createdAt", "eventId");

ALTER TABLE "IntegrationOutboxEvent"
ADD CONSTRAINT "IntegrationOutboxEvent_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
