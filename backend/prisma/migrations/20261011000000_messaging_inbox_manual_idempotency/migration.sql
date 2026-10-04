ALTER TYPE "OutboundMessageType" ADD VALUE 'MANUAL_REPLY';

ALTER TABLE "OutboundMessage"
  ADD COLUMN "conversationId" TEXT,
  ADD COLUMN "manualClientRequestId" TEXT;

CREATE UNIQUE INDEX "OutboundMessage_businessId_conversationId_manualClientRequestId_key"
  ON "OutboundMessage"("businessId", "conversationId", "manualClientRequestId");

CREATE INDEX "OutboundMessage_businessId_conversationId_createdAt_id_idx"
  ON "OutboundMessage"("businessId", "conversationId", "createdAt", "id");

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_conversationId_businessId_fkey"
  FOREIGN KEY ("conversationId", "businessId") REFERENCES "Conversation"("id", "businessId")
  ON DELETE SET NULL ON UPDATE CASCADE;
