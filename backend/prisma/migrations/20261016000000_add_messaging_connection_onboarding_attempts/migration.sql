-- CreateEnum
CREATE TYPE "MessagingConnectionOnboardingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "MessagingConnectionOnboardingAttempt" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "provider" "MessagingProvider" NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "stateHash" TEXT NOT NULL,
    "status" "MessagingConnectionOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "processingStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "connectionId" TEXT,

    CONSTRAINT "MessagingConnectionOnboardingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnectionOnboardingAttempt_stateHash_key" ON "MessagingConnectionOnboardingAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "MessagingConnectionOnboardingAttempt_businessId_status_expiresAt_idx" ON "MessagingConnectionOnboardingAttempt"("businessId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "MessagingConnectionOnboardingAttempt_businessId_createdAt_idx" ON "MessagingConnectionOnboardingAttempt"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessagingConnectionOnboardingAttempt" ADD CONSTRAINT "MessagingConnectionOnboardingAttempt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingConnectionOnboardingAttempt" ADD CONSTRAINT "MessagingConnectionOnboardingAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MessagingConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
