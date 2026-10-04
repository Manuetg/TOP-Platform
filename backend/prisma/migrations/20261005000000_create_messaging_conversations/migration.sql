CREATE TYPE "ConversationMode" AS ENUM ('BOT', 'HUMAN');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "InboundMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'LOCATION', 'INTERACTIVE');

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "channel" "MessagingChannel" NOT NULL,
  "externalParticipant" TEXT NOT NULL,
  "contactId" TEXT,
  "mode" "ConversationMode" NOT NULL DEFAULT 'BOT',
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InboundMessage" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "channel" "MessagingChannel" NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "messageType" "InboundMessageType" NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_id_businessId_key"
  ON "Conversation"("id", "businessId");
CREATE INDEX "Conversation_businessId_channel_externalParticipant_status_lastMessageAt_id_idx"
  ON "Conversation"("businessId", "channel", "externalParticipant", "status", "lastMessageAt", "id");
CREATE INDEX "Conversation_businessId_status_lastMessageAt_id_idx"
  ON "Conversation"("businessId", "status", "lastMessageAt", "id");

CREATE UNIQUE INDEX "InboundMessage_businessId_channel_providerMessageId_key"
  ON "InboundMessage"("businessId", "channel", "providerMessageId");
CREATE INDEX "InboundMessage_businessId_conversationId_receivedAt_id_idx"
  ON "InboundMessage"("businessId", "conversationId", "receivedAt", "id");
CREATE INDEX "InboundMessage_businessId_sender_receivedAt_id_idx"
  ON "InboundMessage"("businessId", "sender", "receivedAt", "id");

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundMessage"
  ADD CONSTRAINT "InboundMessage_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboundMessage"
  ADD CONSTRAINT "InboundMessage_conversationId_businessId_fkey"
  FOREIGN KEY ("conversationId", "businessId") REFERENCES "Conversation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
