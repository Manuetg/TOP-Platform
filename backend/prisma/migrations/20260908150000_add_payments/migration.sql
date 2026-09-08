CREATE TYPE "PaymentMethod" AS ENUM ('CASH','BANK_TRANSFER','CARD','OTHER');
CREATE TYPE "PaymentStatus" AS ENUM ('RECORDED');
CREATE TABLE "Payment" ("id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "amountMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL, "method" "PaymentMethod" NOT NULL, "reference" TEXT, "note" TEXT, "paidAt" TIMESTAMP(3) NOT NULL, "recordedByUserId" TEXT NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'RECORDED', "idempotencyKey" TEXT NOT NULL, "requestFingerprint" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Payment_businessId_idempotencyKey_key" ON "Payment"("businessId","idempotencyKey");
CREATE INDEX "Payment_businessId_bookingId_paidAt_id_idx" ON "Payment"("businessId","bookingId","paidAt","id");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
