-- CreateEnum
CREATE TYPE "MessagingProviderCredentialType" AS ENUM ('BUSINESS_TOKEN');

-- CreateEnum
CREATE TYPE "MessagingProviderCredentialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "MessagingConnection"
ADD COLUMN "providerWabaId" TEXT,
ADD COLUMN "providerBusinessPortfolioId" TEXT;

-- CreateTable
CREATE TABLE "MessagingProviderCredential" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "credentialType" "MessagingProviderCredentialType" NOT NULL,
    "secretReference" TEXT NOT NULL,
    "secretFingerprint" TEXT,
    "status" "MessagingProviderCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingProviderCredential_connectionId_credentialType_key" ON "MessagingProviderCredential"("connectionId", "credentialType");

-- CreateIndex
CREATE INDEX "MessagingProviderCredential_connectionId_status_idx" ON "MessagingProviderCredential"("connectionId", "status");

-- CreateIndex
CREATE INDEX "MessagingProviderCredential_provider_status_idx" ON "MessagingProviderCredential"("provider", "status");

-- AddForeignKey
ALTER TABLE "MessagingProviderCredential" ADD CONSTRAINT "MessagingProviderCredential_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MessagingConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
