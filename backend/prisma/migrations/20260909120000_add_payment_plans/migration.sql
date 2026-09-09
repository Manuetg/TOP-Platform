CREATE TABLE "PaymentPlan" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "totalAmountMinor" INTEGER NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentPlan_totalAmountMinor_check" CHECK ("totalAmountMinor" > 0)
);

CREATE TABLE "PaymentPlanInstallment" (
  "id" TEXT NOT NULL,
  "paymentPlanId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "dueDate" DATE,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "PaymentPlanInstallment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentPlanInstallment_amountMinor_check" CHECK ("amountMinor" > 0),
  CONSTRAINT "PaymentPlanInstallment_sortOrder_check" CHECK ("sortOrder" >= 0)
);

CREATE TABLE "PaymentApplication" (
  "paymentId" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentApplication_pkey" PRIMARY KEY ("paymentId", "installmentId"),
  CONSTRAINT "PaymentApplication_amountMinor_check" CHECK ("amountMinor" > 0)
);

CREATE UNIQUE INDEX "PaymentPlan_bookingId_key" ON "PaymentPlan"("bookingId");
CREATE UNIQUE INDEX "PaymentPlan_bookingId_businessId_key" ON "PaymentPlan"("bookingId", "businessId");
CREATE INDEX "PaymentPlan_businessId_bookingId_idx" ON "PaymentPlan"("businessId", "bookingId");
CREATE UNIQUE INDEX "PaymentPlanInstallment_paymentPlanId_sortOrder_key" ON "PaymentPlanInstallment"("paymentPlanId", "sortOrder");
CREATE INDEX "PaymentPlanInstallment_paymentPlanId_dueDate_idx" ON "PaymentPlanInstallment"("paymentPlanId", "dueDate");
CREATE INDEX "PaymentApplication_installmentId_idx" ON "PaymentApplication"("installmentId");

ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "PaymentPlanInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
