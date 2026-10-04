ALTER TABLE "OutboundMessage"
  DROP CONSTRAINT "OutboundMessage_conversationId_businessId_fkey";

ALTER TABLE "OutboundMessage"
  ADD CONSTRAINT "OutboundMessage_conversationId_businessId_fkey"
  FOREIGN KEY ("conversationId", "businessId") REFERENCES "Conversation"("id", "businessId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
