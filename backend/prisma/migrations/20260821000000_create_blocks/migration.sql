-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('MAINTENANCE', 'OWNER_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "type" "BlockType" NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "BlockStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Block_businessId_startsAt_endsAt_id_idx" ON "Block"("businessId", "startsAt", "endsAt", "id");
CREATE INDEX "Block_businessId_resourceId_startsAt_idx" ON "Block"("businessId", "resourceId", "startsAt");

ALTER TABLE "Block" ADD CONSTRAINT "Block_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
