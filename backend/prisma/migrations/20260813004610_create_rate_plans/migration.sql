-- CreateEnum
CREATE TYPE "RatePlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseNightlyAmountMinor" INTEGER NOT NULL,
    "status" "RatePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" DATE,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanResource" (
    "ratePlanId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatePlanResource_pkey" PRIMARY KEY ("ratePlanId","resourceId")
);

-- CreateIndex
CREATE INDEX "RatePlan_businessId_status_idx" ON "RatePlan"("businessId", "status");

-- CreateIndex
CREATE INDEX "RatePlan_businessId_validFrom_validTo_idx" ON "RatePlan"("businessId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "RatePlanResource_resourceId_idx" ON "RatePlanResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanResource_ratePlanId_resourceId_key" ON "RatePlanResource"("ratePlanId", "resourceId");

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanResource" ADD CONSTRAINT "RatePlanResource_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanResource" ADD CONSTRAINT "RatePlanResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
