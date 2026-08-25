-- CreateTable
CREATE TABLE "PricingSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingSnapshot_bookingId_key" ON "PricingSnapshot"("bookingId");

-- CreateIndex
CREATE INDEX "PricingSnapshot_businessId_createdAt_idx" ON "PricingSnapshot"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "PricingSnapshot" ADD CONSTRAINT "PricingSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingSnapshot" ADD CONSTRAINT "PricingSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
