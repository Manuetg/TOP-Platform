ALTER TYPE "OutboundMessageType" ADD VALUE 'BOOKING_CANCELLATION';

CREATE TYPE "MessagingAutomationType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED');

CREATE TYPE "MessagingTemplateType" AS ENUM ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED');

CREATE TABLE "MessagingSettings" (
    "businessId" TEXT NOT NULL,
    "botEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessagingSettings_pkey" PRIMARY KEY ("businessId")
);

CREATE TABLE "MessagingAutomationRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "automationType" "MessagingAutomationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessagingAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessagingMessageTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "templateType" "MessagingTemplateType" NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MessagingMessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingAutomationRule_businessId_automationType_key" ON "MessagingAutomationRule"("businessId", "automationType");
CREATE UNIQUE INDEX "MessagingAutomationRule_id_businessId_key" ON "MessagingAutomationRule"("id", "businessId");
CREATE INDEX "MessagingAutomationRule_businessId_idx" ON "MessagingAutomationRule"("businessId");
CREATE UNIQUE INDEX "MessagingMessageTemplate_businessId_templateType_channel_key" ON "MessagingMessageTemplate"("businessId", "templateType", "channel");
CREATE UNIQUE INDEX "MessagingMessageTemplate_id_businessId_key" ON "MessagingMessageTemplate"("id", "businessId");
CREATE INDEX "MessagingMessageTemplate_businessId_templateType_idx" ON "MessagingMessageTemplate"("businessId", "templateType");

ALTER TABLE "MessagingSettings" ADD CONSTRAINT "MessagingSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessagingAutomationRule" ADD CONSTRAINT "MessagingAutomationRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingMessageTemplate" ADD CONSTRAINT "MessagingMessageTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessagingAutomationRule" ADD CONSTRAINT "MessagingAutomationRule_templateId_businessId_fkey" FOREIGN KEY ("templateId", "businessId") REFERENCES "MessagingMessageTemplate"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
