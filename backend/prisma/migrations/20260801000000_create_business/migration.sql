-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "businessNumber" INTEGER,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Asuncion',
    "currency" TEXT NOT NULL DEFAULT 'PYG',
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);
