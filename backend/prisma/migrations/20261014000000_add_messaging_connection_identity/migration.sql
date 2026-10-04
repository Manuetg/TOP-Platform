ALTER TABLE "MessagingConnection"
ADD CONSTRAINT "MessagingConnection_id_businessId_key" UNIQUE ("id", "businessId");

ALTER TABLE "Conversation"
ADD COLUMN "messagingConnectionId" TEXT;

ALTER TABLE "OutboundMessage"
ADD COLUMN "messagingConnectionId" TEXT;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_messagingConnectionId_businessId_fkey"
FOREIGN KEY ("messagingConnectionId", "businessId")
REFERENCES "MessagingConnection"("id", "businessId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboundMessage"
ADD CONSTRAINT "OutboundMessage_messagingConnectionId_businessId_fkey"
FOREIGN KEY ("messagingConnectionId", "businessId")
REFERENCES "MessagingConnection"("id", "businessId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Conversation_businessId_channel_messagingConnectionId_externalParticipant_status_lastMessageAt_id_idx"
ON "Conversation"("businessId", "channel", "messagingConnectionId", "externalParticipant", "status", "lastMessageAt", "id");

CREATE INDEX "OutboundMessage_businessId_messagingConnectionId_createdAt_id_idx"
ON "OutboundMessage"("businessId", "messagingConnectionId", "createdAt", "id");
