CREATE TYPE "MessagingProvider" AS ENUM ('META_WHATSAPP');

CREATE TYPE "MessagingConnectionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "MessagingConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "providerPhoneNumberId" TEXT NOT NULL,
    "status" "MessagingConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingConnection_provider_channel_providerPhoneNumberId_key"
ON "MessagingConnection"("provider", "channel", "providerPhoneNumberId");

CREATE INDEX "MessagingConnection_businessId_channel_status_idx"
ON "MessagingConnection"("businessId", "channel", "status");

CREATE INDEX "MessagingConnection_provider_channel_status_idx"
ON "MessagingConnection"("provider", "channel", "status");

ALTER TABLE "MessagingConnection"
ADD CONSTRAINT "MessagingConnection_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
