CREATE TYPE "MessagingChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "OutboundMessageType" AS ENUM ('BOOKING_CONFIRMATION');
CREATE TYPE "OutboundMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "OutboundMessage" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "integrationEventId" TEXT NOT NULL,
  "channel" "MessagingChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "messageType" "OutboundMessageType" NOT NULL,
  "status" "OutboundMessageStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "providerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboundMessage_integrationEventId_messageType_channel_key"
  ON "OutboundMessage"("integrationEventId", "messageType", "channel");

CREATE INDEX "OutboundMessage_businessId_createdAt_id_idx"
  ON "OutboundMessage"("businessId", "createdAt", "id");

CREATE INDEX "OutboundMessage_businessId_status_createdAt_id_idx"
  ON "OutboundMessage"("businessId", "status", "createdAt", "id");

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
