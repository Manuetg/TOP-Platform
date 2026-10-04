ALTER TYPE "OutboundMessageStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "OutboundMessageStatus" ADD VALUE 'READ';

ALTER TABLE "OutboundMessage"
ADD COLUMN "providerStatusAt" TIMESTAMP(3);

CREATE INDEX "OutboundMessage_businessId_providerMessageId_idx"
ON "OutboundMessage"("businessId", "providerMessageId");
