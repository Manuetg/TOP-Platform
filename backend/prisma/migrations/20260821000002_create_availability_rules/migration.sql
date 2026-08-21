CREATE TABLE "AvailabilityRule" (
  "businessId" TEXT NOT NULL,
  "pendingBlocksAvailability" BOOLEAN NOT NULL DEFAULT true,
  "bufferBeforeDays" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterDays" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("businessId"),
  CONSTRAINT "AvailabilityRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
