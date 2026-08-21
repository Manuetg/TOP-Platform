-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "country" TEXT,
    "city" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_businessId_name_lastName_idx" ON "Contact"("businessId", "name", "lastName");
CREATE INDEX "Contact_businessId_phone_idx" ON "Contact"("businessId", "phone");
CREATE INDEX "Contact_businessId_email_idx" ON "Contact"("businessId", "email");
CREATE INDEX "Contact_businessId_documentNumber_idx" ON "Contact"("businessId", "documentNumber");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
