ALTER TYPE "OutboundMessageType" ADD VALUE 'CONVERSATION_REPLY';
CREATE TYPE "ConversationSessionState" AS ENUM ('START', 'MAIN_MENU', 'HUMAN_HANDOFF');

CREATE TABLE "ConversationSession" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "state" "ConversationSessionState" NOT NULL DEFAULT 'START',
  "context" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationBotEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "inboundMessageId" TEXT NOT NULL,
  "integrationEventId" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationBotEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationSession_conversationId_businessId_key"
  ON "ConversationSession"("conversationId", "businessId");
CREATE INDEX "ConversationSession_businessId_state_updatedAt_id_idx"
  ON "ConversationSession"("businessId", "state", "updatedAt", "id");
CREATE UNIQUE INDEX "ConversationBotEvent_businessId_integrationEventId_key"
  ON "ConversationBotEvent"("businessId", "integrationEventId");
CREATE INDEX "ConversationBotEvent_businessId_conversationId_processedAt_id_idx"
  ON "ConversationBotEvent"("businessId", "conversationId", "processedAt", "id");

ALTER TABLE "ConversationSession"
  ADD CONSTRAINT "ConversationSession_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationSession"
  ADD CONSTRAINT "ConversationSession_conversationId_businessId_fkey"
  FOREIGN KEY ("conversationId", "businessId") REFERENCES "Conversation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationBotEvent"
  ADD CONSTRAINT "ConversationBotEvent_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationBotEvent"
  ADD CONSTRAINT "ConversationBotEvent_conversationId_businessId_fkey"
  FOREIGN KEY ("conversationId", "businessId") REFERENCES "Conversation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
