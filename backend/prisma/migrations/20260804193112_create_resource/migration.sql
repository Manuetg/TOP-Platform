-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "description" TEXT,
    "capacityMinimum" INTEGER NOT NULL DEFAULT 1,
    "capacityMaximum" INTEGER NOT NULL,
    "capacityMaximumChildren" INTEGER NOT NULL DEFAULT 0,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_businessId_status_idx" ON "Resource"("businessId", "status");

-- CreateIndex
CREATE INDEX "Resource_businessId_sortOrder_idx" ON "Resource"("businessId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_businessId_internalCode_key" ON "Resource"("businessId", "internalCode");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
