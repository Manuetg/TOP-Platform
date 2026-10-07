-- Finanzas V2/V3 aditivas. Recursos de prueba propios; sin despliegue.
BEGIN;
-- CreateEnum
CREATE TYPE "FinanceImportKind" AS ENUM ('OPENING', 'EXPENSE', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "FinanceExpenseDraftState" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "FinanceDraftDecisionKind" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "FinanceBankMatchState" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceBankComponentKind" AS ENUM ('PAYMENT', 'REFUND', 'SETTLEMENT', 'TRANSFER', 'MOVEMENT');

-- CreateEnum
CREATE TYPE "FinanceTransferLeg" AS ENUM ('FROM', 'TO');

-- CreateEnum
CREATE TYPE "FinanceLaborCostKind" AS ENUM ('PRECOMPUTED_LABOR', 'OWNER_IMPUTED');

-- CreateEnum
CREATE TYPE "FinanceCostBasis" AS ENUM ('ACTUAL', 'ESTIMATE');

-- CreateEnum
CREATE TYPE "FinanceCommitmentState" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "PricingRevision" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'SERVICE',
ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "FinanceExpenseLine" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "bookingSourceStatus" "BookingStatus",
ADD COLUMN     "bookingSourceUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentAdjustment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "accountId" TEXT,
    "sequence" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "beforeStateJson" JSONB NOT NULL,
    "afterStateJson" JSONB NOT NULL,

    CONSTRAINT "PaymentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentApplicationReversal" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentApplicationReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceServiceHead" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "certificateId" TEXT NOT NULL,

    CONSTRAINT "FinanceServiceHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceServiceCertificate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "supersedesCertificateId" TEXT,
    "originalSnapshotId" TEXT NOT NULL,
    "serviceRevisionId" TEXT,
    "sourceHash" CHAR(64) NOT NULL,
    "bookingUpdatedAt" TIMESTAMP(3) NOT NULL,
    "effectiveCheckInOn" DATE NOT NULL,
    "effectiveCheckOutOn" DATE,
    "checkInEventId" TEXT NOT NULL,
    "checkOutEventId" TEXT,
    "pricing" JSONB NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "servicePolicyVersion" TEXT NOT NULL DEFAULT 'NIGHT_SERVICE_V1',
    "evidence" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "FinanceServiceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceServiceUnit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "localNight" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,

    CONSTRAINT "FinanceServiceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTerminalRecognition" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "resourceId" TEXT,
    "version" INTEGER NOT NULL,
    "pricingRevisionId" TEXT NOT NULL,
    "serviceCertificateId" TEXT,
    "serviceCertificateVersion" INTEGER NOT NULL,
    "terminalSourceHash" CHAR(64) NOT NULL,
    "recognitionOn" DATE NOT NULL,
    "finalAmountMinor" BIGINT NOT NULL,
    "serviceAmountMinor" BIGINT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "coverage" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "FinanceTerminalRecognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePeriod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "timeZone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "latestSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCloseSnapshot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "closeVersion" INTEGER NOT NULL,
    "previousSnapshotId" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "sourceToken" CHAR(64) NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT 'BLOCK_CLOSED_PERIOD_V1',
    "policyVersions" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "sourceRefs" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCloseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCloseEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "beforeVersion" INTEGER NOT NULL,
    "afterVersion" INTEGER NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "FinanceCloseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceImportBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceNamespace" VARCHAR(64) NOT NULL,
    "digest" CHAR(64) NOT NULL,
    "formatVersion" TEXT NOT NULL DEFAULT 'FINANCE_HISTORY_V1',
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceImportItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceNamespace" VARCHAR(64) NOT NULL,
    "externalKey" VARCHAR(120) NOT NULL,
    "kind" "FinanceImportKind" NOT NULL,
    "payloadDigest" CHAR(64) NOT NULL,
    "openingId" TEXT,
    "expenseId" TEXT,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpenseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseTemplateRevision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "reference" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpenseTemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseTemplateLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "resourceId" TEXT,
    "bookingId" TEXT,
    "bookingSourceUpdatedAt" TIMESTAMP(3),
    "bookingSourceStatus" "BookingStatus",
    "amountMinor" BIGINT NOT NULL,
    "operational" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpenseTemplateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "consumedOn" DATE NOT NULL,
    "dueOn" DATE,
    "counterpartyId" TEXT,
    "reference" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "state" "FinanceExpenseDraftState" NOT NULL DEFAULT 'DRAFT',
    "creatorUserId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateRevisionId" TEXT,
    "periodMonth" VARCHAR(7),
    "approvalPolicyRevisionId" TEXT,
    "submissionVersion" INTEGER,
    "confirmedExpenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpenseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseDraftLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "resourceId" TEXT,
    "bookingId" TEXT,
    "bookingSourceUpdatedAt" TIMESTAMP(3),
    "bookingSourceStatus" "BookingStatus",
    "amountMinor" BIGINT NOT NULL,
    "operational" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpenseDraftLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceApprovalPolicyRevision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL_NEW_EXPENSE_CONFIRMATIONS',
    "requireDifferentActor" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceApprovalPolicyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceDraftDecision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftVersionAtSubmission" INTEGER NOT NULL,
    "policyRevisionId" TEXT NOT NULL,
    "decision" "FinanceDraftDecisionKind" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceDraftDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReimbursementDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "creditorCounterpartyId" TEXT NOT NULL,
    "supplierCounterpartyId" TEXT,
    "externallyPaidOn" DATE NOT NULL,
    "privateReference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReimbursementDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReimbursementClaim" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "creditorCounterpartyId" TEXT NOT NULL,
    "supplierCounterpartyId" TEXT,
    "externallyPaidOn" DATE NOT NULL,
    "privateReference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReimbursementClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankStatement" (
    "result" JSONB NOT NULL,
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceNamespace" VARCHAR(64) NOT NULL,
    "canonicalDigest" CHAR(64) NOT NULL,
    "formatVersion" TEXT NOT NULL DEFAULT 'FINANCE_BANK_V1',
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankRow" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceNamespace" VARCHAR(64) NOT NULL,
    "externalKey" VARCHAR(120) NOT NULL,
    "payloadDigest" CHAR(64) NOT NULL,
    "bookedOn" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankMatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" "FinanceBankMatchState" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "FinanceBankMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankMatchRow" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "bankRowId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "consumedAmountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankMatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankMatchComponent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sourceType" "FinanceBankComponentKind" NOT NULL,
    "paymentId" TEXT,
    "paymentAdjustmentId" TEXT,
    "settlementId" TEXT,
    "transferId" TEXT,
    "cashMovementId" TEXT,
    "sourceLeg" "FinanceTransferLeg",
    "sourceVersion" INTEGER NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankMatchComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankFeeOrigin" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bankRowId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankFeeOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAllocationRule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAllocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAllocationRuleRevision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAllocationRuleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAllocationRulePart" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAllocationRulePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCostAllocation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "ruleRevisionId" TEXT NOT NULL,
    "sourceExpenseLineId" TEXT,
    "sourceLaborRevisionId" TEXT,
    "sourceVersion" INTEGER NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "sourceAmountMinor" BIGINT NOT NULL,
    "sourceBasis" "FinanceCostBasis" NOT NULL,
    "consumedOn" DATE NOT NULL,
    "unassignedMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCostAllocationPart" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCostAllocationPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLaborCost" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "personLabel" TEXT,
    "periodMonth" VARCHAR(7) NOT NULL,
    "consumedOn" DATE NOT NULL,
    "kind" "FinanceLaborCostKind" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualExpenseLineId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLaborCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLaborCostRevision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "laborId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "actualExpenseLineId" TEXT,
    "estimatedMinor" BIGINT,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLaborCostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodMonth" VARCHAR(7) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OPERATING_COST',
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudgetRevision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceBudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBudgetLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "categoryId" TEXT,
    "resourceId" TEXT,
    "approvedMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCommitment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "categoryId" TEXT,
    "resourceId" TEXT,
    "expectedConsumptionOn" DATE NOT NULL,
    "dueOn" DATE,
    "operational" BOOLEAN NOT NULL,
    "reference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" "FinanceCommitmentState" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledByUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "FinanceCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCommitmentConversion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "consumedMinor" BIGINT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCommitmentConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEvidenceFile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "expenseVersion" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_requestId_key" ON "PaymentAdjustment"("requestId");

-- CreateIndex
CREATE INDEX "PaymentAdjustment_businessId_bookingId_occurredAt_id_idx" ON "PaymentAdjustment"("businessId", "bookingId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_id_businessId_key" ON "PaymentAdjustment"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_id_businessId_paymentId_key" ON "PaymentAdjustment"("id", "businessId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_paymentId_sequence_key" ON "PaymentAdjustment"("paymentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_requestId_businessId_key" ON "PaymentAdjustment"("requestId", "businessId");

-- CreateIndex
CREATE INDEX "PaymentApplicationReversal_businessId_paymentId_installment_idx" ON "PaymentApplicationReversal"("businessId", "paymentId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentApplicationReversal_adjustmentId_paymentId_installme_key" ON "PaymentApplicationReversal"("adjustmentId", "paymentId", "installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceHead_certificateId_key" ON "FinanceServiceHead"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceHead_bookingId_businessId_key" ON "FinanceServiceHead"("bookingId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceHead_certificateId_businessId_bookingId_key" ON "FinanceServiceHead"("certificateId", "businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceCertificate_supersedesCertificateId_key" ON "FinanceServiceCertificate"("supersedesCertificateId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceCertificate_requestId_key" ON "FinanceServiceCertificate"("requestId");

-- CreateIndex
CREATE INDEX "FinanceServiceCertificate_businessId_recordedAt_id_idx" ON "FinanceServiceCertificate"("businessId", "recordedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceCertificate_id_businessId_bookingId_key" ON "FinanceServiceCertificate"("id", "businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceCertificate_requestId_businessId_key" ON "FinanceServiceCertificate"("requestId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceCertificate_supersedesCertificateId_businessI_key" ON "FinanceServiceCertificate"("supersedesCertificateId", "businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceCertificate_bookingId_businessId_version_key" ON "FinanceServiceCertificate"("bookingId", "businessId", "version");

-- CreateIndex
CREATE INDEX "FinanceServiceUnit_businessId_localNight_certificateId_idx" ON "FinanceServiceUnit"("businessId", "localNight", "certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceServiceUnit_certificateId_localNight_key" ON "FinanceServiceUnit"("certificateId", "localNight");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTerminalRecognition_requestId_key" ON "FinanceTerminalRecognition"("requestId");

-- CreateIndex
CREATE INDEX "FinanceTerminalRecognition_businessId_recognitionOn_id_idx" ON "FinanceTerminalRecognition"("businessId", "recognitionOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTerminalRecognition_id_businessId_key" ON "FinanceTerminalRecognition"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTerminalRecognition_bookingId_businessId_version_key" ON "FinanceTerminalRecognition"("bookingId", "businessId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTerminalRecognition_requestId_businessId_key" ON "FinanceTerminalRecognition"("requestId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_latestSnapshotId_key" ON "FinancePeriod"("latestSnapshotId");

-- CreateIndex
CREATE INDEX "FinancePeriod_businessId_status_from_idx" ON "FinancePeriod"("businessId", "status", "from");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_id_businessId_key" ON "FinancePeriod"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_latestSnapshotId_id_businessId_key" ON "FinancePeriod"("latestSnapshotId", "id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePeriod_businessId_from_to_key" ON "FinancePeriod"("businessId", "from", "to");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseSnapshot_previousSnapshotId_key" ON "FinanceCloseSnapshot"("previousSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseSnapshot_id_periodId_businessId_key" ON "FinanceCloseSnapshot"("id", "periodId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseSnapshot_previousSnapshotId_periodId_businessId_key" ON "FinanceCloseSnapshot"("previousSnapshotId", "periodId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseSnapshot_periodId_businessId_closeVersion_key" ON "FinanceCloseSnapshot"("periodId", "businessId", "closeVersion");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseEvent_requestId_key" ON "FinanceCloseEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseEvent_periodId_businessId_afterVersion_key" ON "FinanceCloseEvent"("periodId", "businessId", "afterVersion");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCloseEvent_requestId_businessId_key" ON "FinanceCloseEvent"("requestId", "businessId");

-- CreateIndex
CREATE INDEX "FinanceImportBatch_businessId_loadedAt_id_idx" ON "FinanceImportBatch"("businessId", "loadedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceImportBatch_id_businessId_key" ON "FinanceImportBatch"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceImportBatch_id_businessId_sourceNamespace_key" ON "FinanceImportBatch"("id", "businessId", "sourceNamespace");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceImportBatch_businessId_sourceNamespace_digest_key" ON "FinanceImportBatch"("businessId", "sourceNamespace", "digest");

-- CreateIndex
CREATE INDEX "FinanceImportItem_batchId_businessId_idx" ON "FinanceImportItem"("batchId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceImportItem_id_businessId_key" ON "FinanceImportItem"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceImportItem_businessId_sourceNamespace_externalKey_key" ON "FinanceImportItem"("businessId", "sourceNamespace", "externalKey");

-- CreateIndex
CREATE INDEX "FinanceExpenseTemplate_businessId_archived_name_id_idx" ON "FinanceExpenseTemplate"("businessId", "archived", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseTemplate_id_businessId_key" ON "FinanceExpenseTemplate"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseTemplateRevision_id_businessId_key" ON "FinanceExpenseTemplateRevision"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseTemplateRevision_id_templateId_businessId_key" ON "FinanceExpenseTemplateRevision"("id", "templateId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseTemplateRevision_templateId_businessId_revisi_key" ON "FinanceExpenseTemplateRevision"("templateId", "businessId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseTemplateLine_id_businessId_key" ON "FinanceExpenseTemplateLine"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseTemplateLine_revisionId_businessId_ordinal_key" ON "FinanceExpenseTemplateLine"("revisionId", "businessId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseDraft_confirmedExpenseId_key" ON "FinanceExpenseDraft"("confirmedExpenseId");

-- CreateIndex
CREATE INDEX "FinanceExpenseDraft_businessId_state_createdAt_id_idx" ON "FinanceExpenseDraft"("businessId", "state", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseDraft_id_businessId_key" ON "FinanceExpenseDraft"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseDraft_confirmedExpenseId_businessId_key" ON "FinanceExpenseDraft"("confirmedExpenseId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseDraft_businessId_templateId_periodMonth_key" ON "FinanceExpenseDraft"("businessId", "templateId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseDraftLine_id_businessId_key" ON "FinanceExpenseDraftLine"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseDraftLine_draftId_businessId_definitionVersio_key" ON "FinanceExpenseDraftLine"("draftId", "businessId", "definitionVersion", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceApprovalPolicyRevision_id_businessId_key" ON "FinanceApprovalPolicyRevision"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceApprovalPolicyRevision_businessId_version_key" ON "FinanceApprovalPolicyRevision"("businessId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDraftDecision_id_businessId_key" ON "FinanceDraftDecision"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDraftDecision_draftId_businessId_draftVersionAtSubmi_key" ON "FinanceDraftDecision"("draftId", "businessId", "draftVersionAtSubmission");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReimbursementDraft_draftId_key" ON "FinanceReimbursementDraft"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReimbursementDraft_id_businessId_key" ON "FinanceReimbursementDraft"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReimbursementDraft_draftId_businessId_key" ON "FinanceReimbursementDraft"("draftId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReimbursementClaim_expenseId_key" ON "FinanceReimbursementClaim"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReimbursementClaim_id_businessId_key" ON "FinanceReimbursementClaim"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReimbursementClaim_expenseId_businessId_key" ON "FinanceReimbursementClaim"("expenseId", "businessId");

-- CreateIndex
CREATE INDEX "FinanceBankStatement_businessId_loadedAt_id_idx" ON "FinanceBankStatement"("businessId", "loadedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatement_id_businessId_key" ON "FinanceBankStatement"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatement_id_businessId_accountId_sourceNamespac_key" ON "FinanceBankStatement"("id", "businessId", "accountId", "sourceNamespace");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankStatement_businessId_accountId_sourceNamespace_c_key" ON "FinanceBankStatement"("businessId", "accountId", "sourceNamespace", "canonicalDigest");

-- CreateIndex
CREATE INDEX "FinanceBankRow_businessId_accountId_bookedOn_id_idx" ON "FinanceBankRow"("businessId", "accountId", "bookedOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankRow_id_businessId_key" ON "FinanceBankRow"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankRow_id_businessId_accountId_key" ON "FinanceBankRow"("id", "businessId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankRow_businessId_accountId_sourceNamespace_externa_key" ON "FinanceBankRow"("businessId", "accountId", "sourceNamespace", "externalKey");

-- CreateIndex
CREATE INDEX "FinanceBankMatch_businessId_state_createdAt_id_idx" ON "FinanceBankMatch"("businessId", "state", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatch_id_businessId_key" ON "FinanceBankMatch"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatch_id_businessId_accountId_key" ON "FinanceBankMatch"("id", "businessId", "accountId");

-- CreateIndex
CREATE INDEX "FinanceBankMatchRow_bankRowId_businessId_idx" ON "FinanceBankMatchRow"("bankRowId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchRow_id_businessId_key" ON "FinanceBankMatchRow"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchRow_matchId_businessId_bankRowId_key" ON "FinanceBankMatchRow"("matchId", "businessId", "bankRowId");

-- CreateIndex
CREATE INDEX "FinanceBankMatchComponent_businessId_paymentId_idx" ON "FinanceBankMatchComponent"("businessId", "paymentId");

-- CreateIndex
CREATE INDEX "FinanceBankMatchComponent_businessId_paymentAdjustmentId_idx" ON "FinanceBankMatchComponent"("businessId", "paymentAdjustmentId");

-- CreateIndex
CREATE INDEX "FinanceBankMatchComponent_businessId_settlementId_idx" ON "FinanceBankMatchComponent"("businessId", "settlementId");

-- CreateIndex
CREATE INDEX "FinanceBankMatchComponent_businessId_transferId_sourceLeg_idx" ON "FinanceBankMatchComponent"("businessId", "transferId", "sourceLeg");

-- CreateIndex
CREATE INDEX "FinanceBankMatchComponent_businessId_cashMovementId_idx" ON "FinanceBankMatchComponent"("businessId", "cashMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchComponent_id_businessId_key" ON "FinanceBankMatchComponent"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchComponent_matchId_businessId_paymentId_key" ON "FinanceBankMatchComponent"("matchId", "businessId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchComponent_matchId_businessId_paymentAdjustm_key" ON "FinanceBankMatchComponent"("matchId", "businessId", "paymentAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchComponent_matchId_businessId_settlementId_key" ON "FinanceBankMatchComponent"("matchId", "businessId", "settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchComponent_matchId_businessId_transferId_sou_key" ON "FinanceBankMatchComponent"("matchId", "businessId", "transferId", "sourceLeg");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankMatchComponent_matchId_businessId_cashMovementId_key" ON "FinanceBankMatchComponent"("matchId", "businessId", "cashMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_bankRowId_key" ON "FinanceBankFeeOrigin"("bankRowId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_expenseId_key" ON "FinanceBankFeeOrigin"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_settlementId_key" ON "FinanceBankFeeOrigin"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_id_businessId_key" ON "FinanceBankFeeOrigin"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_bankRowId_businessId_key" ON "FinanceBankFeeOrigin"("bankRowId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_expenseId_businessId_key" ON "FinanceBankFeeOrigin"("expenseId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankFeeOrigin_settlementId_businessId_expenseId_key" ON "FinanceBankFeeOrigin"("settlementId", "businessId", "expenseId");

-- CreateIndex
CREATE INDEX "FinanceAllocationRule_businessId_archived_name_id_idx" ON "FinanceAllocationRule"("businessId", "archived", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAllocationRule_id_businessId_key" ON "FinanceAllocationRule"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAllocationRuleRevision_id_businessId_key" ON "FinanceAllocationRuleRevision"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAllocationRuleRevision_ruleId_businessId_revisionNo_key" ON "FinanceAllocationRuleRevision"("ruleId", "businessId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAllocationRulePart_id_businessId_key" ON "FinanceAllocationRulePart"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAllocationRulePart_revisionId_businessId_resourceId_key" ON "FinanceAllocationRulePart"("revisionId", "businessId", "resourceId");

-- CreateIndex
CREATE INDEX "FinanceCostAllocation_businessId_consumedOn_id_idx" ON "FinanceCostAllocation"("businessId", "consumedOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCostAllocation_id_businessId_key" ON "FinanceCostAllocation"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCostAllocation_businessId_sourceExpenseLineId_revisi_key" ON "FinanceCostAllocation"("businessId", "sourceExpenseLineId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCostAllocation_businessId_sourceLaborRevisionId_revi_key" ON "FinanceCostAllocation"("businessId", "sourceLaborRevisionId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCostAllocationPart_id_businessId_key" ON "FinanceCostAllocationPart"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCostAllocationPart_allocationId_businessId_resourceI_key" ON "FinanceCostAllocationPart"("allocationId", "businessId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLaborCost_actualExpenseLineId_key" ON "FinanceLaborCost"("actualExpenseLineId");

-- CreateIndex
CREATE INDEX "FinanceLaborCost_businessId_periodMonth_id_idx" ON "FinanceLaborCost"("businessId", "periodMonth", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLaborCost_id_businessId_key" ON "FinanceLaborCost"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLaborCost_actualExpenseLineId_businessId_key" ON "FinanceLaborCost"("actualExpenseLineId", "businessId");

-- CreateIndex
CREATE INDEX "FinanceLaborCostRevision_actualExpenseLineId_businessId_lab_idx" ON "FinanceLaborCostRevision"("actualExpenseLineId", "businessId", "laborId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLaborCostRevision_id_businessId_key" ON "FinanceLaborCostRevision"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLaborCostRevision_laborId_businessId_revisionNo_key" ON "FinanceLaborCostRevision"("laborId", "businessId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudget_id_businessId_key" ON "FinanceBudget"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudget_businessId_periodMonth_key" ON "FinanceBudget"("businessId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudgetRevision_id_businessId_key" ON "FinanceBudgetRevision"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudgetRevision_budgetId_businessId_revisionNo_key" ON "FinanceBudgetRevision"("budgetId", "businessId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudgetLine_id_businessId_key" ON "FinanceBudgetLine"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBudgetLine_revisionId_businessId_ordinal_key" ON "FinanceBudgetLine"("revisionId", "businessId", "ordinal");

-- CreateIndex
CREATE INDEX "FinanceCommitment_businessId_state_expectedConsumptionOn_id_idx" ON "FinanceCommitment"("businessId", "state", "expectedConsumptionOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCommitment_id_businessId_key" ON "FinanceCommitment"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCommitmentConversion_expenseId_key" ON "FinanceCommitmentConversion"("expenseId");

-- CreateIndex
CREATE INDEX "FinanceCommitmentConversion_commitmentId_businessId_idx" ON "FinanceCommitmentConversion"("commitmentId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCommitmentConversion_id_businessId_key" ON "FinanceCommitmentConversion"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCommitmentConversion_expenseId_businessId_key" ON "FinanceCommitmentConversion"("expenseId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEvidenceFile_requestId_key" ON "FinanceEvidenceFile"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEvidenceFile_storageKey_key" ON "FinanceEvidenceFile"("storageKey");

-- CreateIndex
CREATE INDEX "FinanceEvidenceFile_businessId_expenseId_createdAt_id_idx" ON "FinanceEvidenceFile"("businessId", "expenseId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEvidenceFile_id_businessId_key" ON "FinanceEvidenceFile"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEvidenceFile_requestId_businessId_key" ON "FinanceEvidenceFile"("requestId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_businessId_bookingId_key" ON "Payment"("id", "businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingTimelineEvent_id_businessId_bookingId_key" ON "BookingTimelineEvent"("id", "businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRevision_requestId_key" ON "PricingRevision"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRevision_id_businessId_bookingId_key" ON "PricingRevision"("id", "businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRevision_requestId_businessId_key" ON "PricingRevision"("requestId", "businessId");

-- CreateIndex
CREATE INDEX "FinanceExpenseLine_businessId_bookingId_idx" ON "FinanceExpenseLine"("businessId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpenseLine_id_businessId_key" ON "FinanceExpenseLine"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSettlement_id_businessId_expenseId_key" ON "FinanceSettlement"("id", "businessId", "expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRequest_id_businessId_key" ON "FinanceRequest"("id", "businessId");

-- AddForeignKey
ALTER TABLE "PricingRevision" ADD CONSTRAINT "PricingRevision_requestId_businessId_fkey" FOREIGN KEY ("requestId", "businessId") REFERENCES "FinanceRequest"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_paymentId_businessId_bookingId_fkey" FOREIGN KEY ("paymentId", "businessId", "bookingId") REFERENCES "Payment"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_requestId_businessId_fkey" FOREIGN KEY ("requestId", "businessId") REFERENCES "FinanceRequest"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplicationReversal" ADD CONSTRAINT "PaymentApplicationReversal_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplicationReversal" ADD CONSTRAINT "PaymentApplicationReversal_paymentId_installmentId_fkey" FOREIGN KEY ("paymentId", "installmentId") REFERENCES "PaymentApplication"("paymentId", "installmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentApplicationReversal" ADD CONSTRAINT "PaymentApplicationReversal_adjustmentId_businessId_payment_fkey" FOREIGN KEY ("adjustmentId", "businessId", "paymentId") REFERENCES "PaymentAdjustment"("id", "businessId", "paymentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceHead" ADD CONSTRAINT "FinanceServiceHead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceHead" ADD CONSTRAINT "FinanceServiceHead_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceHead" ADD CONSTRAINT "FinanceServiceHead_certificateId_businessId_bookingId_fkey" FOREIGN KEY ("certificateId", "businessId", "bookingId") REFERENCES "FinanceServiceCertificate"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_originalSnapshotId_businessId_bo_fkey" FOREIGN KEY ("originalSnapshotId", "businessId", "bookingId") REFERENCES "PricingSnapshot"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_serviceRevisionId_businessId_boo_fkey" FOREIGN KEY ("serviceRevisionId", "businessId", "bookingId") REFERENCES "PricingRevision"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_checkInEventId_businessId_bookin_fkey" FOREIGN KEY ("checkInEventId", "businessId", "bookingId") REFERENCES "BookingTimelineEvent"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_checkOutEventId_businessId_booki_fkey" FOREIGN KEY ("checkOutEventId", "businessId", "bookingId") REFERENCES "BookingTimelineEvent"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_requestId_businessId_fkey" FOREIGN KEY ("requestId", "businessId") REFERENCES "FinanceRequest"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_supersedesCertificateId_business_fkey" FOREIGN KEY ("supersedesCertificateId", "businessId", "bookingId") REFERENCES "FinanceServiceCertificate"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceServiceUnit" ADD CONSTRAINT "FinanceServiceUnit_certificateId_businessId_bookingId_fkey" FOREIGN KEY ("certificateId", "businessId", "bookingId") REFERENCES "FinanceServiceCertificate"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_pricingRevisionId_businessId_bo_fkey" FOREIGN KEY ("pricingRevisionId", "businessId", "bookingId") REFERENCES "PricingRevision"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_serviceCertificateId_businessId_fkey" FOREIGN KEY ("serviceCertificateId", "businessId", "bookingId") REFERENCES "FinanceServiceCertificate"("id", "businessId", "bookingId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_requestId_businessId_fkey" FOREIGN KEY ("requestId", "businessId") REFERENCES "FinanceRequest"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePeriod" ADD CONSTRAINT "FinancePeriod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePeriod" ADD CONSTRAINT "FinancePeriod_latestSnapshotId_id_businessId_fkey" FOREIGN KEY ("latestSnapshotId", "id", "businessId") REFERENCES "FinanceCloseSnapshot"("id", "periodId", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseSnapshot" ADD CONSTRAINT "FinanceCloseSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseSnapshot" ADD CONSTRAINT "FinanceCloseSnapshot_periodId_businessId_fkey" FOREIGN KEY ("periodId", "businessId") REFERENCES "FinancePeriod"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseSnapshot" ADD CONSTRAINT "FinanceCloseSnapshot_previousSnapshotId_periodId_businessI_fkey" FOREIGN KEY ("previousSnapshotId", "periodId", "businessId") REFERENCES "FinanceCloseSnapshot"("id", "periodId", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseSnapshot" ADD CONSTRAINT "FinanceCloseSnapshot_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseEvent" ADD CONSTRAINT "FinanceCloseEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseEvent" ADD CONSTRAINT "FinanceCloseEvent_periodId_businessId_fkey" FOREIGN KEY ("periodId", "businessId") REFERENCES "FinancePeriod"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseEvent" ADD CONSTRAINT "FinanceCloseEvent_snapshotId_periodId_businessId_fkey" FOREIGN KEY ("snapshotId", "periodId", "businessId") REFERENCES "FinanceCloseSnapshot"("id", "periodId", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseEvent" ADD CONSTRAINT "FinanceCloseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCloseEvent" ADD CONSTRAINT "FinanceCloseEvent_requestId_businessId_fkey" FOREIGN KEY ("requestId", "businessId") REFERENCES "FinanceRequest"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportBatch" ADD CONSTRAINT "FinanceImportBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportBatch" ADD CONSTRAINT "FinanceImportBatch_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportItem" ADD CONSTRAINT "FinanceImportItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportItem" ADD CONSTRAINT "FinanceImportItem_batchId_businessId_sourceNamespace_fkey" FOREIGN KEY ("batchId", "businessId", "sourceNamespace") REFERENCES "FinanceImportBatch"("id", "businessId", "sourceNamespace") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportItem" ADD CONSTRAINT "FinanceImportItem_openingId_businessId_fkey" FOREIGN KEY ("openingId", "businessId") REFERENCES "FinanceOpening"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportItem" ADD CONSTRAINT "FinanceImportItem_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceImportItem" ADD CONSTRAINT "FinanceImportItem_settlementId_businessId_fkey" FOREIGN KEY ("settlementId", "businessId") REFERENCES "FinanceSettlement"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplate" ADD CONSTRAINT "FinanceExpenseTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplate" ADD CONSTRAINT "FinanceExpenseTemplate_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateRevision" ADD CONSTRAINT "FinanceExpenseTemplateRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateRevision" ADD CONSTRAINT "FinanceExpenseTemplateRevision_templateId_businessId_fkey" FOREIGN KEY ("templateId", "businessId") REFERENCES "FinanceExpenseTemplate"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateRevision" ADD CONSTRAINT "FinanceExpenseTemplateRevision_counterpartyId_businessId_fkey" FOREIGN KEY ("counterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateRevision" ADD CONSTRAINT "FinanceExpenseTemplateRevision_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateLine" ADD CONSTRAINT "FinanceExpenseTemplateLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateLine" ADD CONSTRAINT "FinanceExpenseTemplateLine_revisionId_businessId_fkey" FOREIGN KEY ("revisionId", "businessId") REFERENCES "FinanceExpenseTemplateRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateLine" ADD CONSTRAINT "FinanceExpenseTemplateLine_categoryId_businessId_fkey" FOREIGN KEY ("categoryId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateLine" ADD CONSTRAINT "FinanceExpenseTemplateLine_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseTemplateLine" ADD CONSTRAINT "FinanceExpenseTemplateLine_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_counterpartyId_businessId_fkey" FOREIGN KEY ("counterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_templateId_businessId_fkey" FOREIGN KEY ("templateId", "businessId") REFERENCES "FinanceExpenseTemplate"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_templateRevisionId_templateId_business_fkey" FOREIGN KEY ("templateRevisionId", "templateId", "businessId") REFERENCES "FinanceExpenseTemplateRevision"("id", "templateId", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_approvalPolicyRevisionId_businessId_fkey" FOREIGN KEY ("approvalPolicyRevisionId", "businessId") REFERENCES "FinanceApprovalPolicyRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_confirmedExpenseId_businessId_fkey" FOREIGN KEY ("confirmedExpenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraftLine" ADD CONSTRAINT "FinanceExpenseDraftLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraftLine" ADD CONSTRAINT "FinanceExpenseDraftLine_draftId_businessId_fkey" FOREIGN KEY ("draftId", "businessId") REFERENCES "FinanceExpenseDraft"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraftLine" ADD CONSTRAINT "FinanceExpenseDraftLine_categoryId_businessId_fkey" FOREIGN KEY ("categoryId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraftLine" ADD CONSTRAINT "FinanceExpenseDraftLine_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseDraftLine" ADD CONSTRAINT "FinanceExpenseDraftLine_bookingId_businessId_fkey" FOREIGN KEY ("bookingId", "businessId") REFERENCES "Booking"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceApprovalPolicyRevision" ADD CONSTRAINT "FinanceApprovalPolicyRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceApprovalPolicyRevision" ADD CONSTRAINT "FinanceApprovalPolicyRevision_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDraftDecision" ADD CONSTRAINT "FinanceDraftDecision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDraftDecision" ADD CONSTRAINT "FinanceDraftDecision_draftId_businessId_fkey" FOREIGN KEY ("draftId", "businessId") REFERENCES "FinanceExpenseDraft"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDraftDecision" ADD CONSTRAINT "FinanceDraftDecision_policyRevisionId_businessId_fkey" FOREIGN KEY ("policyRevisionId", "businessId") REFERENCES "FinanceApprovalPolicyRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceDraftDecision" ADD CONSTRAINT "FinanceDraftDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementDraft" ADD CONSTRAINT "FinanceReimbursementDraft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementDraft" ADD CONSTRAINT "FinanceReimbursementDraft_draftId_businessId_fkey" FOREIGN KEY ("draftId", "businessId") REFERENCES "FinanceExpenseDraft"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementDraft" ADD CONSTRAINT "FinanceReimbursementDraft_creditorCounterpartyId_businessI_fkey" FOREIGN KEY ("creditorCounterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementDraft" ADD CONSTRAINT "FinanceReimbursementDraft_supplierCounterpartyId_businessI_fkey" FOREIGN KEY ("supplierCounterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementDraft" ADD CONSTRAINT "FinanceReimbursementDraft_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementClaim" ADD CONSTRAINT "FinanceReimbursementClaim_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementClaim" ADD CONSTRAINT "FinanceReimbursementClaim_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementClaim" ADD CONSTRAINT "FinanceReimbursementClaim_creditorCounterpartyId_businessI_fkey" FOREIGN KEY ("creditorCounterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementClaim" ADD CONSTRAINT "FinanceReimbursementClaim_supplierCounterpartyId_businessI_fkey" FOREIGN KEY ("supplierCounterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReimbursementClaim" ADD CONSTRAINT "FinanceReimbursementClaim_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankRow" ADD CONSTRAINT "FinanceBankRow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankRow" ADD CONSTRAINT "FinanceBankRow_statementId_businessId_accountId_sourceName_fkey" FOREIGN KEY ("statementId", "businessId", "accountId", "sourceNamespace") REFERENCES "FinanceBankStatement"("id", "businessId", "accountId", "sourceNamespace") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankRow" ADD CONSTRAINT "FinanceBankRow_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatch" ADD CONSTRAINT "FinanceBankMatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatch" ADD CONSTRAINT "FinanceBankMatch_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatch" ADD CONSTRAINT "FinanceBankMatch_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatch" ADD CONSTRAINT "FinanceBankMatch_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchRow" ADD CONSTRAINT "FinanceBankMatchRow_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchRow" ADD CONSTRAINT "FinanceBankMatchRow_matchId_businessId_accountId_fkey" FOREIGN KEY ("matchId", "businessId", "accountId") REFERENCES "FinanceBankMatch"("id", "businessId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchRow" ADD CONSTRAINT "FinanceBankMatchRow_bankRowId_businessId_accountId_fkey" FOREIGN KEY ("bankRowId", "businessId", "accountId") REFERENCES "FinanceBankRow"("id", "businessId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_matchId_businessId_accountId_fkey" FOREIGN KEY ("matchId", "businessId", "accountId") REFERENCES "FinanceBankMatch"("id", "businessId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_paymentId_businessId_fkey" FOREIGN KEY ("paymentId", "businessId") REFERENCES "Payment"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_paymentAdjustmentId_businessId_fkey" FOREIGN KEY ("paymentAdjustmentId", "businessId") REFERENCES "PaymentAdjustment"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_settlementId_businessId_fkey" FOREIGN KEY ("settlementId", "businessId") REFERENCES "FinanceSettlement"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_transferId_businessId_fkey" FOREIGN KEY ("transferId", "businessId") REFERENCES "FinanceTransfer"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_cashMovementId_businessId_fkey" FOREIGN KEY ("cashMovementId", "businessId") REFERENCES "FinanceCashMovement"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankFeeOrigin" ADD CONSTRAINT "FinanceBankFeeOrigin_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankFeeOrigin" ADD CONSTRAINT "FinanceBankFeeOrigin_bankRowId_businessId_fkey" FOREIGN KEY ("bankRowId", "businessId") REFERENCES "FinanceBankRow"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankFeeOrigin" ADD CONSTRAINT "FinanceBankFeeOrigin_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankFeeOrigin" ADD CONSTRAINT "FinanceBankFeeOrigin_settlementId_businessId_expenseId_fkey" FOREIGN KEY ("settlementId", "businessId", "expenseId") REFERENCES "FinanceSettlement"("id", "businessId", "expenseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankFeeOrigin" ADD CONSTRAINT "FinanceBankFeeOrigin_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRule" ADD CONSTRAINT "FinanceAllocationRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRule" ADD CONSTRAINT "FinanceAllocationRule_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRuleRevision" ADD CONSTRAINT "FinanceAllocationRuleRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRuleRevision" ADD CONSTRAINT "FinanceAllocationRuleRevision_ruleId_businessId_fkey" FOREIGN KEY ("ruleId", "businessId") REFERENCES "FinanceAllocationRule"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRuleRevision" ADD CONSTRAINT "FinanceAllocationRuleRevision_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRulePart" ADD CONSTRAINT "FinanceAllocationRulePart_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRulePart" ADD CONSTRAINT "FinanceAllocationRulePart_revisionId_businessId_fkey" FOREIGN KEY ("revisionId", "businessId") REFERENCES "FinanceAllocationRuleRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAllocationRulePart" ADD CONSTRAINT "FinanceAllocationRulePart_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_ruleRevisionId_businessId_fkey" FOREIGN KEY ("ruleRevisionId", "businessId") REFERENCES "FinanceAllocationRuleRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_sourceExpenseLineId_businessId_fkey" FOREIGN KEY ("sourceExpenseLineId", "businessId") REFERENCES "FinanceExpenseLine"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_sourceLaborRevisionId_businessId_fkey" FOREIGN KEY ("sourceLaborRevisionId", "businessId") REFERENCES "FinanceLaborCostRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocationPart" ADD CONSTRAINT "FinanceCostAllocationPart_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocationPart" ADD CONSTRAINT "FinanceCostAllocationPart_allocationId_businessId_fkey" FOREIGN KEY ("allocationId", "businessId") REFERENCES "FinanceCostAllocation"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCostAllocationPart" ADD CONSTRAINT "FinanceCostAllocationPart_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCost" ADD CONSTRAINT "FinanceLaborCost_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCost" ADD CONSTRAINT "FinanceLaborCost_actualExpenseLineId_businessId_fkey" FOREIGN KEY ("actualExpenseLineId", "businessId") REFERENCES "FinanceExpenseLine"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCost" ADD CONSTRAINT "FinanceLaborCost_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCostRevision" ADD CONSTRAINT "FinanceLaborCostRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCostRevision" ADD CONSTRAINT "FinanceLaborCostRevision_laborId_businessId_fkey" FOREIGN KEY ("laborId", "businessId") REFERENCES "FinanceLaborCost"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCostRevision" ADD CONSTRAINT "FinanceLaborCostRevision_actualExpenseLineId_businessId_fkey" FOREIGN KEY ("actualExpenseLineId", "businessId") REFERENCES "FinanceExpenseLine"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLaborCostRevision" ADD CONSTRAINT "FinanceLaborCostRevision_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRevision" ADD CONSTRAINT "FinanceBudgetRevision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRevision" ADD CONSTRAINT "FinanceBudgetRevision_budgetId_businessId_fkey" FOREIGN KEY ("budgetId", "businessId") REFERENCES "FinanceBudget"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRevision" ADD CONSTRAINT "FinanceBudgetRevision_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetRevision" ADD CONSTRAINT "FinanceBudgetRevision_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetLine" ADD CONSTRAINT "FinanceBudgetLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetLine" ADD CONSTRAINT "FinanceBudgetLine_revisionId_businessId_fkey" FOREIGN KEY ("revisionId", "businessId") REFERENCES "FinanceBudgetRevision"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetLine" ADD CONSTRAINT "FinanceBudgetLine_categoryId_businessId_fkey" FOREIGN KEY ("categoryId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBudgetLine" ADD CONSTRAINT "FinanceBudgetLine_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitment" ADD CONSTRAINT "FinanceCommitment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitment" ADD CONSTRAINT "FinanceCommitment_categoryId_businessId_fkey" FOREIGN KEY ("categoryId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitment" ADD CONSTRAINT "FinanceCommitment_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitment" ADD CONSTRAINT "FinanceCommitment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitment" ADD CONSTRAINT "FinanceCommitment_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitmentConversion" ADD CONSTRAINT "FinanceCommitmentConversion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitmentConversion" ADD CONSTRAINT "FinanceCommitmentConversion_commitmentId_businessId_fkey" FOREIGN KEY ("commitmentId", "businessId") REFERENCES "FinanceCommitment"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitmentConversion" ADD CONSTRAINT "FinanceCommitmentConversion_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCommitmentConversion" ADD CONSTRAINT "FinanceCommitmentConversion_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEvidenceFile" ADD CONSTRAINT "FinanceEvidenceFile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEvidenceFile" ADD CONSTRAINT "FinanceEvidenceFile_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEvidenceFile" ADD CONSTRAINT "FinanceEvidenceFile_requestId_businessId_fkey" FOREIGN KEY ("requestId", "businessId") REFERENCES "FinanceRequest"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEvidenceFile" ADD CONSTRAINT "FinanceEvidenceFile_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Complemento aditivo root, staging. No aplicado a DB.
-- FinanceRequest se inserta al final de la MISMA transacción; FKs no permiten huérfanos.
ALTER TABLE "PaymentAdjustment" ALTER CONSTRAINT "PaymentAdjustment_requestId_businessId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "PricingRevision" ALTER CONSTRAINT "PricingRevision_requestId_businessId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceServiceCertificate" ALTER CONSTRAINT "FinanceServiceCertificate_requestId_businessId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceTerminalRecognition" ALTER CONSTRAINT "FinanceTerminalRecognition_requestId_businessId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceCloseEvent" ALTER CONSTRAINT "FinanceCloseEvent_requestId_businessId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceEvidenceFile" ALTER CONSTRAINT "FinanceEvidenceFile_requestId_businessId_fkey" DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "FinanceEvidenceFile" ADD CONSTRAINT "FinanceEvidenceFile_shape_check" CHECK (
  "expenseVersion">=2 AND "sizeBytes" BETWEEN 1 AND 2097152
  AND "mimeType" IN ('application/pdf','image/jpeg','image/png')
  AND length(filename) BETWEEN 1 AND 160 AND filename !~ '[[:cntrl:]/\\]'
  AND "sha256" ~ '^[a-f0-9]{64}$'
  AND "storageKey"='finance-evidence/'||"businessId"||'/'||"expenseId"||'/'||id
);

ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_shape_check" CHECK (
  kind IN ('VOID','REFUND') AND currency='PYG' AND "amountMinor" BETWEEN 1 AND 9007199254740991
  AND sequence>=1 AND length(btrim(reason)) BETWEEN 1 AND 500
  AND ((kind='VOID' AND "accountId" IS NULL AND reference IS NULL)
    OR (kind='REFUND' AND "accountId" IS NOT NULL))
);
ALTER TABLE "PaymentApplicationReversal" ADD CONSTRAINT "PaymentApplicationReversal_money_check"
  CHECK ("amountMinor" BETWEEN 1 AND 9007199254740991);
ALTER TABLE "PricingRevision" ADD CONSTRAINT "PricingRevision_kind_check" CHECK (
  (kind='SERVICE' AND "requestId" IS NULL)
  OR (kind='TERMINAL_FINAL_AMOUNT' AND "requestId" IS NOT NULL AND currency='PYG'
    AND "totalAmountMinor" BETWEEN 0 AND 9007199254740991 AND items='[]'::jsonb)
);
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_booking_context_check" CHECK (
  ("bookingId" IS NULL AND "bookingSourceUpdatedAt" IS NULL AND "bookingSourceStatus" IS NULL)
  OR ("bookingId" IS NOT NULL AND "bookingSourceUpdatedAt" IS NOT NULL AND "bookingSourceStatus" IS NOT NULL)
);

ALTER TABLE "FinanceServiceHead" ADD CONSTRAINT "FinanceServiceHead_version_check" CHECK (version>=1);
ALTER TABLE "FinanceServiceCertificate" ADD CONSTRAINT "FinanceServiceCertificate_shape_check" CHECK (
  version>=1 AND "policyVersion" IN ('BREAKDOWN_BY_DATE_V1','WEIGHTED_AGREED_NIGHTS_V1','EQUAL_AGREED_NIGHTS_V1')
  AND "servicePolicyVersion"='NIGHT_SERVICE_V1' AND "sourceHash" ~ '^[a-f0-9]{64}$'
  AND ("effectiveCheckOutOn" IS NULL OR "effectiveCheckOutOn">"effectiveCheckInOn")
  AND ("effectiveCheckOutOn" IS NULL OR "checkOutEventId" IS NOT NULL)
  AND length(btrim(evidence)) BETWEEN 1 AND 500 AND length(btrim(reason)) BETWEEN 1 AND 500
);
ALTER TABLE "FinanceServiceUnit" ADD CONSTRAINT "FinanceServiceUnit_money_check"
  CHECK ("amountMinor" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "FinanceTerminalRecognition" ADD CONSTRAINT "FinanceTerminalRecognition_shape_check" CHECK (
  version>=1 AND "serviceCertificateVersion">=0 AND "terminalSourceHash" ~ '^[a-f0-9]{64}$'
  AND "finalAmountMinor" BETWEEN 0 AND 9007199254740991
  AND "serviceAmountMinor" BETWEEN 0 AND 9007199254740991
  AND "amountMinor" BETWEEN 0 AND 9007199254740991
  AND "finalAmountMinor"="serviceAmountMinor"+"amountMinor"
  AND coverage IN ('COMPLETE','DECLARED_NONE')
  AND (coverage<>'DECLARED_NONE' OR "serviceAmountMinor"=0)
  AND length(btrim(classification)) BETWEEN 1 AND 500
  AND (("serviceCertificateId" IS NULL AND "serviceCertificateVersion"=0)
    OR ("serviceCertificateId" IS NOT NULL AND "serviceCertificateVersion">=1))
  AND length(btrim(reason)) BETWEEN 1 AND 500
);
ALTER TABLE "FinancePeriod" ADD CONSTRAINT "FinancePeriod_shape_check" CHECK (
  status IN ('OPEN','CLOSED') AND version>=1 AND EXTRACT(DAY FROM "from")=1
  AND "to"=("from"+INTERVAL '1 month')::date
  AND (status<>'CLOSED' OR "latestSnapshotId" IS NOT NULL)
);
ALTER TABLE "FinanceCloseSnapshot" ADD CONSTRAINT "FinanceCloseSnapshot_shape_check" CHECK (
  "closeVersion">=2 AND "sourceToken" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND "policyVersion"='BLOCK_CLOSED_PERIOD_V1' AND "asOf"<="recordedAt"
  AND jsonb_typeof("sourceRefs")='array' AND jsonb_typeof(checklist)='array'
  AND jsonb_typeof(payload)='object' AND jsonb_typeof("policyVersions")='object'
);
ALTER TABLE "FinanceCloseEvent" ADD CONSTRAINT "FinanceCloseEvent_shape_check" CHECK (
  type IN ('CLOSE','REOPEN') AND "beforeVersion">=1 AND "afterVersion"="beforeVersion"+1
  AND length(btrim(reason)) BETWEEN 1 AND 500
);

-- Companion externo para revisión/root merge. NO EJECUTADO; no es migración aplicada.
-- PostgreSQL 16. Se instala después del DDL Prisma combinado, en transacción de root.
-- Agregados usan el mismo Business UPDATE que el writer; no sustituyen autorización,
-- CAS, preview/sourceHash, lectores públicos ni locks Booking KEY SHARE previos.
-- UNIQUE en Prisma conserva UUID TEXT + tenant. No se crean extensiones ni servicios.

ALTER TABLE "FinanceImportBatch" ADD CONSTRAINT "FinanceImportBatch_v2_shape_ck"
  CHECK ("sourceNamespace" <> '' AND "digest" ~ '^[0-9a-f]{64}$' AND "formatVersion" = 'FINANCE_HISTORY_V1');
ALTER TABLE "FinanceImportItem" ADD CONSTRAINT "FinanceImportItem_v2_source_ck"
  CHECK ("externalKey" <> '' AND "payloadDigest" ~ '^[0-9a-f]{64}$'
    AND num_nonnulls("openingId", "expenseId", "settlementId") = 1
    AND (("kind" = 'OPENING' AND "openingId" IS NOT NULL)
      OR ("kind" = 'EXPENSE' AND "expenseId" IS NOT NULL)
      OR ("kind" = 'SETTLEMENT' AND "settlementId" IS NOT NULL)));
ALTER TABLE "FinanceExpenseDraft" ADD CONSTRAINT "FinanceExpenseDraft_v2_shape_ck"
  CHECK ("definitionVersion" >= 1 AND ("submissionVersion" IS NULL OR "submissionVersion" >= 1)
    AND (num_nonnulls("templateId", "templateRevisionId", "periodMonth") IN (0, 3))
    AND ("periodMonth" IS NULL OR "periodMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
    AND ("templateId" IS NULL OR to_char("consumedOn", 'YYYY-MM') = "periodMonth")
    AND (("state" = 'CONFIRMED') = ("confirmedExpenseId" IS NOT NULL))
    AND ("state" NOT IN ('SUBMITTED','APPROVED','REJECTED') OR "submissionVersion" IS NOT NULL));
ALTER TABLE "FinanceApprovalPolicyRevision" ADD CONSTRAINT "FinanceApprovalPolicyRevision_v2_scope_ck"
  CHECK ("scope" = 'ALL_NEW_EXPENSE_CONFIRMATIONS' AND "requireDifferentActor");
ALTER TABLE "FinanceDraftDecision" ADD CONSTRAINT "FinanceDraftDecision_v2_version_ck"
  CHECK ("draftVersionAtSubmission" >= 1);
ALTER TABLE "FinanceBankStatement" ADD CONSTRAINT "FinanceBankStatement_v2_shape_ck"
  CHECK ("sourceNamespace" <> '' AND "canonicalDigest" ~ '^[0-9a-f]{64}$' AND "formatVersion" = 'FINANCE_BANK_V1');
ALTER TABLE "FinanceBankRow" ADD CONSTRAINT "FinanceBankRow_v2_shape_ck"
  CHECK ("externalKey" <> '' AND "payloadDigest" ~ '^[0-9a-f]{64}$' AND "version" = 1);
ALTER TABLE "FinanceBankMatchComponent" ADD CONSTRAINT "FinanceBankMatchComponent_v2_source_ck"
  CHECK ("sourceVersion" >= 1 AND "sourceHash" ~ '^[0-9a-f]{64}$'
    AND num_nonnulls("paymentId", "paymentAdjustmentId", "settlementId", "transferId", "cashMovementId") = 1
    AND (("sourceType" = 'PAYMENT' AND "paymentId" IS NOT NULL AND "amountMinor" > 0 AND "sourceLeg" IS NULL)
      OR ("sourceType" = 'REFUND' AND "paymentAdjustmentId" IS NOT NULL AND "amountMinor" < 0 AND "sourceLeg" IS NULL)
      OR ("sourceType" = 'SETTLEMENT' AND "settlementId" IS NOT NULL AND "amountMinor" < 0 AND "sourceLeg" IS NULL)
      OR ("sourceType" = 'TRANSFER' AND "transferId" IS NOT NULL AND "sourceLeg" IS NOT NULL
        AND (("sourceLeg" = 'FROM' AND "amountMinor" < 0) OR ("sourceLeg" = 'TO' AND "amountMinor" > 0)))
      OR ("sourceType" = 'MOVEMENT' AND "cashMovementId" IS NOT NULL AND "sourceLeg" IS NULL)));
ALTER TABLE "FinanceAllocationRuleRevision" ADD CONSTRAINT "FinanceAllocationRuleRevision_v2_dates_ck"
  CHECK ("validTo" IS NULL OR "validTo" > "validFrom");
ALTER TABLE "FinanceAllocationRulePart" ADD CONSTRAINT "FinanceAllocationRulePart_v2_bps_ck"
  CHECK ("basisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_v2_source_ck"
  CHECK (num_nonnulls("sourceExpenseLineId", "sourceLaborRevisionId") = 1
    AND "sourceVersion" >= 1 AND "sourceHash" ~ '^[0-9a-f]{64}$'
    AND (("sourceExpenseLineId" IS NOT NULL AND "sourceBasis" = 'ACTUAL')
      OR ("sourceLaborRevisionId" IS NOT NULL AND "sourceBasis" = 'ESTIMATE'))
    AND "unassignedMinor" BETWEEN 0 AND "sourceAmountMinor");
ALTER TABLE "FinanceLaborCost" ADD CONSTRAINT "FinanceLaborCost_v2_scope_ck"
  CHECK ("periodMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND to_char("consumedOn", 'YYYY-MM') = "periodMonth"
    AND ("kind" <> 'OWNER_IMPUTED' OR "actualExpenseLineId" IS NULL));
-- null/null conserva fuente desconocida; no se convierte en cero.
ALTER TABLE "FinanceLaborCostRevision" ADD CONSTRAINT "FinanceLaborCostRevision_v2_estimate_ck"
  CHECK ("estimatedMinor" IS NULL OR "estimatedMinor" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "FinanceBudget" ADD CONSTRAINT "FinanceBudget_v2_scope_ck"
  CHECK ("kind" = 'OPERATING_COST' AND "periodMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "FinanceBudgetRevision" ADD CONSTRAINT "FinanceBudgetRevision_v2_approval_ck"
  CHECK (num_nonnulls("approvedAt", "approvedByUserId") IN (0, 2));
CREATE UNIQUE INDEX "FinanceBudgetLine_v2_dimension_key"
  ON "FinanceBudgetLine" ("revisionId", "businessId", "categoryId", "resourceId") NULLS NOT DISTINCT;

DO $checks$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['FinanceExpenseTemplate','FinanceExpenseDraft','FinanceApprovalPolicyRevision',
    'FinanceBankMatch','FinanceLaborCost','FinanceBudget','FinanceCommitment'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("version" >= 1)', t, t || '_v2_version_ck');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['FinanceExpenseTemplateRevision','FinanceAllocationRuleRevision',
    'FinanceCostAllocation','FinanceLaborCostRevision','FinanceBudgetRevision'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("revisionNo" >= 1)', t, t || '_v2_revision_ck');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['FinanceExpenseTemplateLine','FinanceExpenseDraftLine'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("ordinal" BETWEEN 0 AND 49)', t, t || '_v2_ordinal_ck');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (num_nonnulls("bookingId", "bookingSourceUpdatedAt", "bookingSourceStatus") IN (0,3))', t, t || '_v2_booking_snapshot_ck');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['FinanceExpenseTemplateRevision','FinanceExpenseTemplateLine',
    'FinanceExpenseDraft','FinanceExpenseDraftLine','FinanceCommitment'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("amountMinor" BETWEEN 1 AND 9007199254740991)', t, t || '_v2_money_ck');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['FinanceBankRow','FinanceBankMatchComponent'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("amountMinor" <> 0 AND "amountMinor" BETWEEN -9007199254740991 AND 9007199254740991)', t, t || '_v2_money_ck');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['FinanceBankMatch','FinanceCommitment'] LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (("state" = ''CANCELLED'' AND num_nonnulls("cancelledAt","cancelledByUserId","cancelReason") = 3) OR ("state" = ''ACTIVE'' AND num_nonnulls("cancelledAt","cancelledByUserId","cancelReason") = 0))', t, t || '_v2_cancel_ck');
  END LOOP;
END;
$checks$;
ALTER TABLE "FinanceExpenseDraftLine" ADD CONSTRAINT "FinanceExpenseDraftLine_v2_definition_ck" CHECK ("definitionVersion" >= 1);
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_v2_booking_snapshot_ck"
  CHECK (num_nonnulls("bookingId", "bookingSourceUpdatedAt", "bookingSourceStatus") IN (0,3));
ALTER TABLE "FinanceCostAllocation" ADD CONSTRAINT "FinanceCostAllocation_v2_money_ck" CHECK ("sourceAmountMinor" BETWEEN 1 AND 9007199254740991);
ALTER TABLE "FinanceCostAllocationPart" ADD CONSTRAINT "FinanceCostAllocationPart_v2_money_ck" CHECK ("amountMinor" BETWEEN 0 AND 9007199254740991);
ALTER TABLE "FinanceBudgetLine" ADD CONSTRAINT "FinanceBudgetLine_v2_money_ck" CHECK ("approvedMinor" BETWEEN 0 AND 9007199254740991 AND "ordinal" BETWEEN 0 AND 199);
ALTER TABLE "FinanceBankMatchRow" ADD CONSTRAINT "FinanceBankMatchRow_v2_money_ck" CHECK ("consumedAmountMinor" <> 0 AND "consumedAmountMinor" BETWEEN -9007199254740991 AND 9007199254740991);
ALTER TABLE "FinanceCommitmentConversion" ADD CONSTRAINT "FinanceCommitmentConversion_v2_money_ck" CHECK ("consumedMinor" BETWEEN 1 AND 9007199254740991);

CREATE FUNCTION finance_v2_reference_kinds_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE data jsonb := to_jsonb(NEW); field_name text; expected_kind text; found_kind text;
BEGIN
  FOREACH field_name IN ARRAY ARRAY['categoryId','counterpartyId','creditorCounterpartyId','supplierCounterpartyId'] LOOP
    IF data ->> field_name IS NULL THEN CONTINUE; END IF;
    expected_kind := CASE WHEN field_name = 'categoryId' THEN 'CATEGORY' ELSE 'COUNTERPARTY' END;
    SELECT "kind" INTO found_kind FROM "FinanceCatalog"
      WHERE "id" = data ->> field_name AND "businessId" = data ->> 'businessId';
    IF found_kind IS DISTINCT FROM expected_kind THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Referencia financiera inválida';
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'FinanceBankStatement' THEN
    SELECT "kind" INTO found_kind FROM "FinanceAccount" WHERE "id" = data ->> 'accountId' AND "businessId" = data ->> 'businessId';
    IF found_kind IS DISTINCT FROM 'BANK' THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cuenta de evidencia inválida'; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DO $triggers$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['FinanceExpenseTemplateRevision','FinanceExpenseTemplateLine','FinanceExpenseDraft',
    'FinanceExpenseDraftLine','FinanceReimbursementDraft','FinanceReimbursementClaim','FinanceBudgetLine','FinanceCommitment','FinanceBankStatement'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_v2_reference_kinds_guard()', t || '_v2_kind_guard', t);
  END LOOP;
END;
$triggers$;

-- Misma línea puede aparecer en revisiones del MISMO laborId. Otro laborId se rechaza,
-- incluso si el primero dejó de ser current: conserva ownership de la fuente histórica.
CREATE FUNCTION finance_v2_labor_source_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE labor "FinanceLaborCost"%ROWTYPE; source "FinanceExpenseLine"%ROWTYPE; consumed date;
BEGIN
  SELECT * INTO STRICT labor FROM "FinanceLaborCost" WHERE "id" = NEW."laborId" AND "businessId" = NEW."businessId";
  IF labor."kind" = 'OWNER_IMPUTED' AND NEW."actualExpenseLineId" IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Fuente laboral inválida';
  END IF;
  IF NEW."actualExpenseLineId" IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "FinanceLaborCostRevision" WHERE "businessId" = NEW."businessId"
      AND "actualExpenseLineId" = NEW."actualExpenseLineId" AND "laborId" <> NEW."laborId") THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Fuente laboral ya clasificada';
    END IF;
    SELECT * INTO STRICT source FROM "FinanceExpenseLine" WHERE "id" = NEW."actualExpenseLineId" AND "businessId" = NEW."businessId";
    SELECT "consumedOn" INTO STRICT consumed FROM "FinanceExpense" WHERE "id" = source."expenseId" AND "businessId" = NEW."businessId";
    IF NOT source."operational" OR consumed <> labor."consumedOn" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Scope laboral inválido';
    END IF;
  END IF;
  IF NEW."revisionNo" = (SELECT max("revisionNo") FROM "FinanceLaborCostRevision" WHERE "laborId" = NEW."laborId" AND "businessId" = NEW."businessId")
    AND labor."actualExpenseLineId" IS DISTINCT FROM NEW."actualExpenseLineId" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Fuente laboral current inválida';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE CONSTRAINT TRIGGER "FinanceLaborCostRevision_v2_source_guard" AFTER INSERT ON "FinanceLaborCostRevision"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_v2_labor_source_guard();

CREATE FUNCTION finance_v2_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE allocation "FinanceCostAllocation"%ROWTYPE; source "FinanceExpenseLine"%ROWTYPE; labor_revision "FinanceLaborCostRevision"%ROWTYPE;
  rule_revision "FinanceAllocationRuleRevision"%ROWTYPE; assigned numeric; source_consumed date;
BEGIN
  IF TG_TABLE_NAME = 'FinanceCostAllocation' THEN allocation := NEW;
  ELSE SELECT * INTO STRICT allocation FROM "FinanceCostAllocation" WHERE "id" = NEW."allocationId" AND "businessId" = NEW."businessId"; END IF;
  SELECT * INTO STRICT rule_revision FROM "FinanceAllocationRuleRevision" WHERE "id" = allocation."ruleRevisionId" AND "businessId" = allocation."businessId";
  SELECT coalesce(sum("amountMinor"),0) INTO assigned FROM "FinanceCostAllocationPart" WHERE "allocationId" = allocation."id" AND "businessId" = allocation."businessId";
  IF assigned + allocation."unassignedMinor" <> allocation."sourceAmountMinor"
    OR allocation."consumedOn" < rule_revision."validFrom"
    OR (rule_revision."validTo" IS NOT NULL AND allocation."consumedOn" >= rule_revision."validTo") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Reparto de costo inválido';
  END IF;
  IF allocation."sourceExpenseLineId" IS NOT NULL THEN
    SELECT * INTO STRICT source FROM "FinanceExpenseLine" WHERE "id" = allocation."sourceExpenseLineId" AND "businessId" = allocation."businessId";
    SELECT "consumedOn" INTO STRICT source_consumed FROM "FinanceExpense" WHERE "id" = source."expenseId" AND "businessId" = allocation."businessId";
    IF NOT source."operational" OR source."resourceId" IS NOT NULL OR source."bookingId" IS NOT NULL
      OR source."amountMinor" <> allocation."sourceAmountMinor" OR source_consumed <> allocation."consumedOn" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Fuente común inválida';
    END IF;
  ELSE
    SELECT * INTO STRICT labor_revision FROM "FinanceLaborCostRevision" WHERE "id" = allocation."sourceLaborRevisionId" AND "businessId" = allocation."businessId";
    SELECT "consumedOn" INTO STRICT source_consumed FROM "FinanceLaborCost" WHERE "id" = labor_revision."laborId" AND "businessId" = allocation."businessId";
    IF labor_revision."actualExpenseLineId" IS NOT NULL OR labor_revision."estimatedMinor" IS DISTINCT FROM allocation."sourceAmountMinor"
      OR source_consumed <> allocation."consumedOn" THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Fuente estimada inválida';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE CONSTRAINT TRIGGER "FinanceCostAllocation_v2_sum_guard" AFTER INSERT ON "FinanceCostAllocation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_v2_allocation_guard();
CREATE CONSTRAINT TRIGGER "FinanceCostAllocationPart_v2_sum_guard" AFTER INSERT ON "FinanceCostAllocationPart" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_v2_allocation_guard();

CREATE FUNCTION finance_v2_rule_parts_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF (SELECT coalesce(sum("basisPoints"),0) FROM "FinanceAllocationRulePart" WHERE "revisionId" = NEW."revisionId" AND "businessId" = NEW."businessId") > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Porcentajes inválidos';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE CONSTRAINT TRIGGER "FinanceAllocationRulePart_v2_sum_guard" AFTER INSERT ON "FinanceAllocationRulePart" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_v2_rule_parts_guard();

CREATE FUNCTION finance_v2_commitment_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE committed bigint; converted numeric; expense "FinanceExpense"%ROWTYPE;
BEGIN
  SELECT "amountMinor" INTO STRICT committed FROM "FinanceCommitment" WHERE "id" = NEW."commitmentId" AND "businessId" = NEW."businessId";
  SELECT coalesce(sum("consumedMinor"),0) INTO converted FROM "FinanceCommitmentConversion" WHERE "commitmentId" = NEW."commitmentId" AND "businessId" = NEW."businessId";
  SELECT * INTO STRICT expense FROM "FinanceExpense" WHERE "id" = NEW."expenseId" AND "businessId" = NEW."businessId";
  IF converted > committed OR NEW."consumedMinor" <> expense."amountMinor" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Conversión de compromiso inválida';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE CONSTRAINT TRIGGER "FinanceCommitmentConversion_v2_sum_guard" AFTER INSERT ON "FinanceCommitmentConversion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_v2_commitment_guard();

CREATE FUNCTION finance_v2_preserve_row() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Historia financiera inmutable';
END;
$fn$;
DO $preserve$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['FinanceImportBatch','FinanceImportItem','FinanceExpenseTemplateRevision','FinanceExpenseTemplateLine',
    'FinanceExpenseDraftLine','FinanceApprovalPolicyRevision','FinanceDraftDecision','FinanceReimbursementClaim',
    'FinanceBankStatement','FinanceBankRow','FinanceBankMatchRow','FinanceBankMatchComponent','FinanceBankFeeOrigin',
    'FinanceAllocationRuleRevision','FinanceAllocationRulePart','FinanceCostAllocation','FinanceCostAllocationPart',
    'FinanceLaborCostRevision','FinanceBudgetLine','FinanceCommitmentConversion'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_v2_preserve_row()', t || '_v2_immutable_guard', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['FinanceExpenseTemplate','FinanceExpenseDraft','FinanceReimbursementDraft','FinanceBankMatch',
    'FinanceAllocationRule','FinanceLaborCost','FinanceBudget','FinanceBudgetRevision','FinanceCommitment'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_v2_preserve_row()', t || '_v2_no_delete_guard', t);
  END LOOP;
END;
$preserve$;
-- Capacidades, current policy/approval, sumas documento/draft/budget, capacidades
-- signed de bank matching y transiciones CAS se verifican también en application.
-- Los tests PostgreSQL vacío/upgrade/carreras/rollback de este companion: NOT RUN.

-- Payment owns these non-materialized, read-only projections. Original facts remain intact.
CREATE VIEW "PaymentEffectiveState" AS
WITH adjustments AS (
  SELECT "paymentId", "businessId", "bookingId",
    SUM(CASE WHEN kind='VOID' THEN "amountMinor" ELSE 0 END) AS voided,
    SUM(CASE WHEN kind='REFUND' THEN "amountMinor" ELSE 0 END) AS refunded,
    COUNT(*) AS adjustment_count,
    COUNT(*) FILTER (WHERE kind='VOID') AS void_count,
    BOOL_OR(kind NOT IN ('VOID','REFUND') OR "amountMinor"<=0 OR currency<>'PYG') AS invalid
  FROM "PaymentAdjustment"
  GROUP BY "paymentId", "businessId", "bookingId"
)
SELECT p.id AS "paymentId", p."businessId", p."bookingId", p.currency,
  p."amountMinor" AS "grossRecordedAmountMinor",
  COALESCE(a.voided,0)::bigint AS "voidedAmountMinor",
  COALESCE(a.refunded,0)::bigint AS "refundedAmountMinor",
  (p."amountMinor"-COALESCE(a.voided,0)-COALESCE(a.refunded,0))::bigint AS "netRetainedAmountMinor",
  (1+COALESCE(a.adjustment_count,0))::bigint AS "paymentVersion",
  (p."amountMinor"<=0 OR p."amountMinor">9007199254740991 OR p.currency<>'PYG'
    OR COALESCE(a.invalid,false) OR COALESCE(a.void_count,0)>1
    OR (COALESCE(a.void_count,0)>0 AND (a.voided<>p."amountMinor" OR a.refunded<>0))
    OR COALESCE(a.voided,0)+COALESCE(a.refunded,0)>p."amountMinor"
  ) AS "invalidMonetaryData"
FROM "Payment" p
LEFT JOIN adjustments a ON a."paymentId"=p.id AND a."businessId"=p."businessId" AND a."bookingId"=p."bookingId"
WHERE p.status='RECORDED';

CREATE VIEW "PaymentApplicationEffective" AS
WITH reversals AS (
  SELECT "paymentId", "installmentId", SUM("amountMinor") AS reversed,
    BOOL_OR("amountMinor"<=0) AS invalid
  FROM "PaymentApplicationReversal"
  GROUP BY "paymentId", "installmentId"
)
SELECT application."paymentId", application."installmentId", payment."businessId", payment."bookingId", payment.currency,
  application."amountMinor" AS "originalAmountMinor",
  COALESCE(reversal.reversed,0)::bigint AS "reversedAmountMinor",
  (application."amountMinor"-COALESCE(reversal.reversed,0))::bigint AS "effectiveAmountMinor",
  (payment."invalidMonetaryData" OR application."amountMinor"<=0
    OR application."amountMinor">9007199254740991 OR COALESCE(reversal.invalid,false)
    OR COALESCE(reversal.reversed,0)>application."amountMinor"
    OR plan."businessId"<>payment."businessId" OR plan."bookingId"<>payment."bookingId"
    OR plan.currency<>payment.currency
  ) AS "invalidMonetaryData"
FROM "PaymentApplication" application
JOIN "PaymentEffectiveState" payment ON payment."paymentId"=application."paymentId"
JOIN "PaymentPlanInstallment" installment ON installment.id=application."installmentId"
JOIN "PaymentPlan" plan ON plan.id=installment."paymentPlanId"
LEFT JOIN reversals reversal ON reversal."paymentId"=application."paymentId" AND reversal."installmentId"=application."installmentId";

-- Writers/readers additionally enforce SUM(effectiveApplication) <= netRetained per original
-- and SUM(effectiveApplication) <= installment.amountMinor. A booking aggregate cannot prove either.

-- PROPUESTA EXTERNA, NO APLICADA. PostgreSQL 16, public, SECURITY INVOKER.
-- Root debe revisar mapping, convertir a migration y probarla en su DB propia.
-- No TRUNCATE guard, RLS, GUC bypass ni protección contra DDL/administrador.
-- El collector debe emitir sourceRefs económicas del período, NO todo el payload bruto.
-- Cada helper es una unidad natural independiente; SQL DML no usa locks de Booking en CLOSE.

-- 1. Manifest fijo: aliases publicados, fechas económicas, padres y grupos de writers.
-- d: [campo,date|utc,opcional]; r: [desde,hasta,pair|open|units]; m: mes YYYY-MM.
-- p: [tabla,campoFK,scope|impact,opcional]; c: hijos existentes para UPDATE/DELETE.
-- b: campos de mantenimiento benignos; nunca permite cambiar tenant/id/nombre/importes.
CREATE OR REPLACE FUNCTION public.top_finance_guard_manifest() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $manifest$
SELECT $json${
 "tables": {
  "Business":{"a":["BUSINESS"]},
  "Resource":{"a":["RESOURCE"]},
  "Booking":{"a":["BOOKING"],"r":[["checkInDate","checkOutDate","pair"]]},
  "BookingResource":{"a":["BOOKING_RESOURCE"],"p":[["Booking","bookingId","impact",false],["Resource","resourceId","scope",false]]},
  "BookingTimelineEvent":{"a":["BOOKING_TIMELINE_EVENT"],"d":[["occurredAt","utc",false]],"p":[["Booking","bookingId","scope",false]]},
  "Payment":{"a":["PAYMENT"],"d":[["paidAt","utc",false]],"p":[["Booking","bookingId","scope",false]]},
  "PaymentPlan":{"a":["PAYMENT_PLAN"],"p":[["Booking","bookingId","impact",false]]},
  "PaymentPlanInstallment":{"a":["PAYMENT_INSTALLMENT"],"d":[["dueDate","date",true]],"p":[["PaymentPlan","paymentPlanId","impact",false]]},
  "PaymentApplication":{"a":["PAYMENT_APPLICATION"],"p":[["Payment","paymentId","impact",false],["PaymentPlanInstallment","installmentId","scope",false]]},
  "PaymentAdjustment":{"a":["PAYMENT_ADJUSTMENT"],"d":[["occurredAt","utc",false]],"p":[["Booking","bookingId","scope",false],["FinanceAccount","accountId","scope",true]]},
  "PaymentApplicationReversal":{"a":["PAYMENT_APPLICATION_REVERSAL"],"p":[["PaymentAdjustment","adjustmentId","impact",false],["Payment","paymentId","scope",false],["PaymentPlanInstallment","installmentId","scope",false]]},
  "PricingSnapshot":{"a":["SERVICE_PRICING","PRICING_SNAPSHOT"],"p":[["Booking","bookingId","impact",false]]},
  "PricingRevision":{"a":["SERVICE_PRICING","TERMINAL_PRICING"],"p":[["Booking","bookingId","impact",false],["PricingSnapshot","originalSnapshotId","scope",false]]},
  "FinanceCatalog":{"a":["CATALOG"],"b":["archived","version"]},
  "FinanceAccount":{"a":["ACCOUNT"],"b":["archived","version"]},
  "FinanceOpening":{"a":["ACCOUNT_OPENING"],"d":[["occurredAt","utc",false]],"p":[["FinanceAccount","accountId","scope",false]]},
  "FinanceExpense":{"a":["EXPENSE"],"d":[["consumedOn","date",false],["dueOn","date",true]],"b":["version"],"p":[["FinanceCatalog","counterpartyId","scope",true]]},
  "FinanceEvidenceFile":{"a":["EVIDENCE_FILE"],"p":[["FinanceExpense","expenseId","scope",false],["FinanceRequest","requestId","scope",false]]},
  "FinanceExpenseLine":{"a":["EXPENSE_LINE"],"p":[["FinanceExpense","expenseId","impact",false],["FinanceCatalog","categoryId","scope",false],["Resource","resourceId","scope",true],["Booking","bookingId","scope",true]]},
  "FinanceSettlement":{"a":["SETTLEMENT"],"d":[["occurredAt","utc",false]],"p":[["FinanceExpense","expenseId","scope",false],["FinanceAccount","accountId","scope",false]]},
  "FinancePaymentLink":{"a":["PAYMENT_ACCOUNT_LINK"],"p":[["Payment","paymentId","impact",false],["FinanceAccount","accountId","scope",false]]},
  "FinanceTransfer":{"a":["TRANSFER"],"d":[["occurredAt","utc",false]],"p":[["FinanceAccount","fromAccountId","scope",false],["FinanceAccount","toAccountId","scope",false]]},
  "FinanceCashMovement":{"a":["CASH_MOVEMENT"],"d":[["occurredAt","utc",false]],"p":[["FinanceAccount","accountId","scope",false],["FinanceOpening","openingId","scope",true]]},
  "FinanceCashCount":{"a":["CASH_COUNT"],"d":[["occurredAt","utc",false]],"p":[["FinanceAccount","accountId","scope",false],["FinanceCashMovement","adjustmentId","scope",true]]},
  "FinanceReview":{"a":["MOVEMENT_REVIEW"]},
  "FinanceRequest":{"a":["FINANCE_REQUEST"],"c":[["FinanceEvidenceFile","requestId"],["PaymentAdjustment","requestId"],["FinanceServiceCertificate","requestId"],["FinanceTerminalRecognition","requestId"]]},
  "FinanceAudit":{"a":["FINANCE_AUDIT"],"d":[["occurredAt","utc",false]]},
  "FinanceServiceHead":{"a":["SERVICE_HEAD"],"p":[["Booking","bookingId","scope",false],["FinanceServiceCertificate","certificateId","impact",false]]},
  "FinanceServiceCertificate":{"a":["SERVICE_CERTIFICATE"],"r":[["effectiveCheckInOn","effectiveCheckOutOn","units"]],"p":[["Booking","bookingId","scope",false],["Resource","resourceId","scope",false],["PricingSnapshot","originalSnapshotId","scope",false],["PricingRevision","serviceRevisionId","scope",true],["FinanceServiceCertificate","supersedesCertificateId","impact",true],["BookingTimelineEvent","checkInEventId","scope",false],["BookingTimelineEvent","checkOutEventId","scope",true]],"c":[["FinanceServiceUnit","certificateId"]]},
  "FinanceServiceUnit":{"a":["SERVICE_UNIT"],"d":[["localNight","date",false]],"p":[["FinanceServiceCertificate","certificateId","scope",false]]},
  "FinanceTerminalRecognition":{"a":["TERMINAL_RECOGNITION"],"d":[["recognitionOn","date",false]],"p":[["Booking","bookingId","scope",false],["Resource","resourceId","scope",true],["PricingRevision","pricingRevisionId","scope",false],["FinanceServiceCertificate","serviceCertificateId","scope",true]]},
  "FinanceImportBatch":{"a":["IMPORT_BATCH"],"c":[["FinanceImportItem","batchId"]]},
  "FinanceImportItem":{"a":["IMPORT_ITEM"],"p":[["FinanceImportBatch","batchId","scope",false]]},
  "FinanceExpenseTemplate":{"a":["EXPENSE_TEMPLATE"],"b":["archived","version"]},
  "FinanceExpenseTemplateRevision":{"a":["EXPENSE_TEMPLATE_REVISION"],"p":[["FinanceExpenseTemplate","templateId","scope",false],["FinanceCatalog","counterpartyId","scope",true]]},
  "FinanceExpenseTemplateLine":{"a":["EXPENSE_TEMPLATE_LINE"],"p":[["FinanceExpenseTemplateRevision","revisionId","impact",false],["FinanceCatalog","categoryId","scope",false],["Resource","resourceId","scope",true],["Booking","bookingId","scope",true]]},
  "FinanceExpenseDraft":{"a":["EXPENSE_DRAFT"],"d":[["consumedOn","date",false],["dueOn","date",true]],"p":[["FinanceCatalog","counterpartyId","scope",true],["FinanceExpenseTemplate","templateId","scope",true],["FinanceExpenseTemplateRevision","templateRevisionId","scope",true],["FinanceApprovalPolicyRevision","approvalPolicyRevisionId","scope",true],["FinanceExpense","confirmedExpenseId","scope",true]]},
  "FinanceExpenseDraftLine":{"a":["EXPENSE_DRAFT_LINE"],"p":[["FinanceExpenseDraft","draftId","impact",false],["FinanceCatalog","categoryId","scope",false],["Resource","resourceId","scope",true],["Booking","bookingId","scope",true]]},
  "FinanceApprovalPolicyRevision":{"a":["APPROVAL_POLICY"]},
  "FinanceDraftDecision":{"a":["DRAFT_DECISION"],"p":[["FinanceExpenseDraft","draftId","impact",false],["FinanceApprovalPolicyRevision","policyRevisionId","scope",false]]},
  "FinanceReimbursementDraft":{"a":["REIMBURSEMENT_DRAFT"],"d":[["externallyPaidOn","date",false]],"p":[["FinanceExpenseDraft","draftId","impact",false],["FinanceCatalog","creditorCounterpartyId","scope",false],["FinanceCatalog","supplierCounterpartyId","scope",true]]},
  "FinanceReimbursementClaim":{"a":["REIMBURSEMENT_CLAIM"],"d":[["externallyPaidOn","date",false]],"p":[["FinanceExpense","expenseId","impact",false],["FinanceCatalog","creditorCounterpartyId","scope",false],["FinanceCatalog","supplierCounterpartyId","scope",true]]},
  "FinanceBankStatement":{"a":["BANK_STATEMENT"],"p":[["FinanceAccount","accountId","scope",false]],"c":[["FinanceBankRow","statementId"]]},
  "FinanceBankRow":{"a":["BANK_ROW"],"d":[["bookedOn","date",false]],"p":[["FinanceBankStatement","statementId","scope",false],["FinanceAccount","accountId","scope",false]]},
  "FinanceBankMatch":{"a":["BANK_MATCH"],"p":[["FinanceAccount","accountId","scope",false]],"c":[["FinanceBankMatchRow","matchId"],["FinanceBankMatchComponent","matchId"]]},
  "FinanceBankMatchRow":{"a":["BANK_MATCH_ROW"],"p":[["FinanceBankMatch","matchId","scope",false],["FinanceBankRow","bankRowId","impact",false],["FinanceAccount","accountId","scope",false]]},
  "FinanceBankMatchComponent":{"a":["BANK_MATCH_COMPONENT"],"p":[["FinanceBankMatch","matchId","scope",false],["FinanceAccount","accountId","scope",false]]},
  "FinanceBankFeeOrigin":{"a":["BANK_FEE_ORIGIN"],"p":[["FinanceBankRow","bankRowId","impact",false],["FinanceExpense","expenseId","impact",false],["FinanceSettlement","settlementId","impact",false]]},
  "FinanceAllocationRule":{"a":["ALLOCATION_RULE","COST_RULE"],"b":["archived","version"],"c":[["FinanceAllocationRuleRevision","ruleId"]]},
  "FinanceAllocationRuleRevision":{"a":["ALLOCATION_RULE_REVISION","COST_RULE_REVISION"],"r":[["validFrom","validTo","open"]],"p":[["FinanceAllocationRule","ruleId","scope",false]]},
  "FinanceAllocationRulePart":{"a":["ALLOCATION_RULE_PART","COST_RULE_PART"],"p":[["FinanceAllocationRuleRevision","revisionId","impact",false],["Resource","resourceId","scope",false]]},
  "FinanceCostAllocation":{"a":["COST_ALLOCATION"],"d":[["consumedOn","date",false]],"p":[["FinanceAllocationRuleRevision","ruleRevisionId","scope",false],["FinanceExpenseLine","sourceExpenseLineId","scope",true],["FinanceLaborCostRevision","sourceLaborRevisionId","scope",true]]},
  "FinanceCostAllocationPart":{"a":["COST_ALLOCATION_PART"],"p":[["FinanceCostAllocation","allocationId","impact",false],["Resource","resourceId","scope",false]]},
  "FinanceLaborCost":{"a":["LABOR_COST"],"d":[["consumedOn","date",false]],"m":["periodMonth"],"p":[["FinanceExpenseLine","actualExpenseLineId","scope",true]]},
  "FinanceLaborCostRevision":{"a":["LABOR_COST_REVISION","LABOR_REVISION"],"p":[["FinanceLaborCost","laborId","impact",false],["FinanceExpenseLine","actualExpenseLineId","impact",true]]},
  "FinanceBudget":{"a":["BUDGET"],"m":["periodMonth"]},
  "FinanceBudgetRevision":{"a":["BUDGET_REVISION"],"p":[["FinanceBudget","budgetId","impact",false]]},
  "FinanceBudgetLine":{"a":["BUDGET_LINE"],"p":[["FinanceBudgetRevision","revisionId","impact",false],["FinanceCatalog","categoryId","scope",true],["Resource","resourceId","scope",true]]},
  "FinanceCommitment":{"a":["COMMITMENT"],"d":[["expectedConsumptionOn","date",false],["dueOn","date",true]],"p":[["FinanceCatalog","categoryId","scope",true],["Resource","resourceId","scope",true]]},
  "FinanceCommitmentConversion":{"a":["COMMITMENT_CONVERSION"],"p":[["FinanceCommitment","commitmentId","impact",false],["FinanceExpense","expenseId","impact",false]]}
 },
 "writers": {
  "PAYMENT_REGISTER":["Payment"],
  "PAYMENT_VOID":["Payment","PaymentAdjustment","PaymentApplicationReversal"],
  "PAYMENT_REFUND":["Payment","PaymentAdjustment","PaymentApplicationReversal"],
  "PAYMENT_PLAN":["PaymentPlan","PaymentPlanInstallment"],
  "PAYMENT_APPLICATION":["PaymentApplication","PaymentApplicationReversal"],
  "PRICING_SNAPSHOT":["PricingSnapshot"],
  "PRICING_SERVICE_REVISION":["PricingRevision","Booking","BookingTimelineEvent"],
  "PRICING_TERMINAL_FINAL_AMOUNT":["PricingRevision","Booking","BookingTimelineEvent"],
  "BOOKING_AMENDMENT":["Booking","BookingResource","BookingTimelineEvent","PricingRevision"],
  "SERVICE_CERTIFICATE":["FinanceServiceHead","FinanceServiceCertificate","FinanceServiceUnit"],
  "TERMINAL_RECOGNITION":["FinanceTerminalRecognition"],
  "EXPENSE":["FinanceExpense","FinanceExpenseLine"],
  "EXPENSE_LINE":["FinanceExpense","FinanceExpenseLine"],
  "EXPENSE_CORRECTION":["FinanceExpense","FinanceExpenseLine"],
  "EXPENSE_EVIDENCE":["FinanceExpense","FinanceExpenseLine","FinanceEvidenceFile"],
  "SETTLEMENT":["FinanceSettlement"],
  "ACCOUNT_OPENING":["FinanceOpening"],
  "PAYMENT_ACCOUNT_LINK":["FinancePaymentLink"],
  "TRANSFER":["FinanceTransfer"],
  "CASH_MOVEMENT":["FinanceCashMovement"],
  "CASH_COUNT":["FinanceCashCount","FinanceCashMovement"],
  "MOVEMENT_REVIEW":["FinanceReview"],
  "COST_ALLOCATION":["FinanceCostAllocation","FinanceCostAllocationPart"],
  "LABOR_COST":["FinanceLaborCost","FinanceLaborCostRevision"],
  "BUDGET":["FinanceBudget","FinanceBudgetRevision","FinanceBudgetLine"],
  "COMMITMENT":["FinanceCommitment","FinanceCommitmentConversion"],
  "COMMITMENT_CONVERSION":["FinanceCommitment","FinanceCommitmentConversion"],
  "BOOKING_FINANCIAL_CONTEXT":["Booking","BookingResource","BookingTimelineEvent","PricingRevision"],
  "RESOURCE_FINANCIAL_CONTEXT":["Resource","Business"],
  "DIRECT_SQL_IMPORT":[],
  "BANK_STATEMENT":["FinanceBankStatement","FinanceBankRow"],
  "BANK_IMPORT":["FinanceBankStatement","FinanceBankRow"],
  "BANK_MATCH":["FinanceBankMatch","FinanceBankMatchRow","FinanceBankMatchComponent","FinanceBankFeeOrigin"],
  "COST_RULE":["FinanceAllocationRule","FinanceAllocationRuleRevision","FinanceAllocationRulePart"],
  "EXPENSE_DRAFT":["FinanceExpenseDraft","FinanceExpenseDraftLine","FinanceDraftDecision","FinanceReimbursementDraft","FinanceReimbursementClaim"],
  "EXPENSE_TEMPLATE":["FinanceExpenseTemplate","FinanceExpenseTemplateRevision","FinanceExpenseTemplateLine"],
  "APPROVAL_POLICY":["FinanceApprovalPolicyRevision"],
  "CATALOG":["FinanceCatalog"],
  "ACCOUNT":["FinanceAccount"],
  "IMPORT_HISTORY":["FinanceImportBatch","FinanceImportItem"]
 }
}$json$::jsonb;
$manifest$;

-- 2. Primitivas: argumentos ausentes/malformados son errores, no impactos vacíos.
CREATE OR REPLACE FUNCTION public.top_finance_require_rc() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Guarded financial DML requires READ COMMITTED';
 END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_date(p_text text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_date date;
BEGIN
 IF p_text IS NULL OR p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Missing or malformed economic date';
 END IF;
 BEGIN v_date:=p_text::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Invalid calendar date';
 END;
 IF to_char(v_date,'YYYY-MM-DD')<>p_text THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 RETURN v_date;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_instant_date(p_text text,p_timezone text) RETURNS date
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_instant timestamptz;
BEGIN
 IF p_text IS NULL OR p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023';
 END IF;
 BEGIN
  -- Prisma DateTime es timestamp sin timezone con contenido UTC, no hora local de sesión.
  IF p_text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN v_instant:=p_text::timestamptz;
  ELSE v_instant:=p_text::timestamp AT TIME ZONE 'UTC'; END IF;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023';
 END;
 RETURN (v_instant AT TIME ZONE p_timezone)::date;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_refs_valid(p_refs jsonb,p_versions boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_ref jsonb;
BEGIN
 IF p_refs IS NULL OR jsonb_typeof(p_refs)<>'array' THEN RETURN false; END IF;
 FOR v_ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
  IF jsonb_typeof(v_ref)<>'object' OR jsonb_typeof(v_ref->'type') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v_ref->'id') IS DISTINCT FROM 'string' OR length(btrim(v_ref->>'type'))=0
   OR length(btrim(v_ref->>'id'))=0 OR (v_ref->>'type')!~'^[A-Z][A-Z0-9_]*$'
   OR (p_versions AND (jsonb_typeof(v_ref->'version') IS DISTINCT FROM 'string' OR length(btrim(v_ref->>'version'))=0)) THEN RETURN false; END IF;
 END LOOP;
 RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_refs) r GROUP BY r->>'type',r->>'id' HAVING count(*)>1);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_lookup(p_table text,p_id text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_row jsonb;
BEGIN
 IF NOT (public.top_finance_guard_manifest()->'tables' ? p_table) OR p_table IN ('PaymentApplication','BookingResource')
  OR p_id IS NULL OR length(btrim(p_id))=0 THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 EXECUTE format('SELECT to_jsonb(parent) FROM public.%I parent WHERE id=$1',p_table) INTO v_row USING p_id;
 IF v_row IS NULL THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Financial parent unavailable'; END IF;
 RETURN v_row;
END;
$fn$;

-- 3. Shape de snapshot: el servidor calcula/revalida recognitionHash en escritura/lectura.
-- No hay canonicalizador JS en SQL ni un hash del payload por cada financial write.
CREATE OR REPLACE FUNCTION public.top_finance_close_snapshot_valid(p_snapshot jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_item jsonb; v_keys text[]:='{}'; v_required text[]:=ARRAY['SOURCES_COMPLETE','COMMON_CUT','PYG_SAFE','COST_CONSERVATION','RECOGNITION_COVERAGE','ACCOUNT_OPENINGS','EVIDENCE','MOVEMENT_REVIEW','CASH_COUNTS'];
BEGIN
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object'
  OR (p_snapshot->>'policyVersion') IS DISTINCT FROM 'BLOCK_CLOSED_PERIOD_V1'
  OR jsonb_typeof(p_snapshot->'payload') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_snapshot->'policyVersions') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_snapshot->'checklist') IS DISTINCT FROM 'array'
  OR NOT public.top_finance_guard_refs_valid(p_snapshot->'sourceRefs',true)
  OR coalesce(p_snapshot->>'sourceToken','')!~'^[a-f0-9]{64}$'
  OR coalesce(p_snapshot->>'payloadHash','')!~'^[a-f0-9]{64}$'
  OR (p_snapshot->>'closeVersion')::integer<2
  OR (p_snapshot->>'asOf')::timestamp>(p_snapshot->>'recordedAt')::timestamp THEN RETURN false; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_snapshot->'checklist') LOOP
  IF jsonb_typeof(v_item)<>'object' OR NOT (v_item->>'key'=ANY(v_required))
   OR jsonb_typeof(v_item->'passed') IS DISTINCT FROM 'boolean'
   OR coalesce(v_item->>'severity','') NOT IN ('BLOCKER','EXCEPTION')
   OR v_item->>'key'=ANY(v_keys) THEN RETURN false; END IF;
  IF v_item->>'key'=ANY(v_required[1:4]) AND (v_item->>'severity'<>'BLOCKER' OR v_item->>'passed'<>'true') THEN RETURN false; END IF;
  IF v_item->>'passed'='false' AND (v_item->>'severity'<>'EXCEPTION' OR length(btrim(coalesce(v_item->>'acknowledgement','')))=0) THEN RETURN false; END IF;
  v_keys:=v_keys||(v_item->>'key');
 END LOOP;
 RETURN cardinality(v_keys)=cardinality(v_required) AND v_keys@>v_required;
 EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$fn$;

-- 4. Lock/snapshot común de guardas. VOLATILE + RC renueva snapshot después del lock.
CREATE OR REPLACE FUNCTION public.top_finance_assert_impact(p_business_id text,p_dates date[],p_changed_sources jsonb,p_ranges daterange[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_period record;
BEGIN
 PERFORM public.top_finance_require_rc();
 IF p_business_id IS NULL OR length(btrim(p_business_id))=0 OR p_dates IS NULL OR p_ranges IS NULL
  OR array_position(p_dates,NULL) IS NOT NULL OR array_position(p_ranges,NULL) IS NOT NULL
  OR NOT public.top_finance_guard_refs_valid(p_changed_sources,false) THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM id FROM public."Business" WHERE id=p_business_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_BUSINESS_MISSING' USING ERRCODE='23503'; END IF;
 FOR v_period IN
  SELECT period.*,to_jsonb(snapshot) AS snapshot_json,snapshot.id AS snapshot_id,
   snapshot."periodId" AS snapshot_period,snapshot."businessId" AS snapshot_business,snapshot."closeVersion" AS snapshot_version
  FROM public."FinancePeriod" period LEFT JOIN public."FinanceCloseSnapshot" snapshot ON snapshot.id=period."latestSnapshotId"
  WHERE period."businessId"=p_business_id AND period.status='CLOSED'
 LOOP
  IF v_period."from" IS NULL OR v_period."to" IS NULL OR v_period."from">=v_period."to"
   OR v_period.snapshot_id IS NULL OR v_period.snapshot_period<>v_period.id OR v_period.snapshot_business<>p_business_id
   OR v_period.snapshot_version<>v_period.version OR NOT public.top_finance_close_snapshot_valid(v_period.snapshot_json) THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='CLOSED period has missing or invalid snapshot';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_dates) affected WHERE affected>=v_period."from" AND affected<v_period."to")
   OR EXISTS(SELECT 1 FROM unnest(p_ranges) affected WHERE affected&&daterange(v_period."from",v_period."to",'[)'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_period.snapshot_json->'sourceRefs') source,
       jsonb_array_elements(p_changed_sources) changed WHERE source->>'type'=changed->>'type' AND source->>'id'=changed->>'id') THEN
   RAISE EXCEPTION 'FINANCE_PERIOD_CLOSED' USING ERRCODE='P0001';
  END IF;
 END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_assert_open(p_business_id text,p_dates date[],p_changed_sources jsonb DEFAULT '[]'::jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.top_finance_assert_impact(p_business_id,p_dates,p_changed_sources,'{}'::daterange[]); END;
$fn$;

-- 5. Padres especiales: whitelist cerrada, nunca SQL recibido por usuario.
CREATE OR REPLACE FUNCTION public.top_finance_guard_extra_parents(p_table text,p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_map jsonb; v_entry jsonb; v_field text; v_count integer:=0; v_kind text; v_parents jsonb:='[]';
BEGIN
 IF p_table='BookingTimelineEvent' THEN
  v_kind:=p_row->>'type';
  IF jsonb_typeof(p_row->'details') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  IF v_kind IN ('PAYMENT_VOID_RECORDED','PAYMENT_REFUND_RECORDED') THEN
   RETURN jsonb_build_array(jsonb_build_array('PaymentAdjustment','details.adjustmentId','impact',false),jsonb_build_array('Payment','details.paymentId','scope',false));
  ELSIF v_kind='PAYMENT_RECORDED' THEN
   RETURN jsonb_build_array(jsonb_build_array('Payment','details.paymentId','impact',false));
  ELSIF v_kind IN ('BOOKING_CREATED','BOOKING_SUBMITTED','BOOKING_CONFIRMED','BOOKING_CANCELLED','BOOKING_CHECKED_IN','BOOKING_CHECKED_OUT','BOOKING_MARKED_NO_SHOW','BOOKING_AMENDED','BOOKING_FINAL_AMOUNT_CONFIRMED') THEN
   RETURN jsonb_build_array(jsonb_build_array('Booking','bookingId','impact',false));
  ELSE RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Unknown booking timeline financial impact'; END IF;
 ELSIF p_table='PaymentAdjustment' THEN
  v_kind:=p_row->>'kind';
  IF v_kind NOT IN ('VOID','REFUND') OR v_kind IS NULL THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_array(jsonb_build_array('Payment','paymentId',CASE WHEN v_kind='VOID' THEN 'impact' ELSE 'scope' END,false));
 ELSIF p_table='FinanceImportItem' THEN
  v_map:='{"OPENING":["FinanceOpening","openingId"],"EXPENSE":["FinanceExpense","expenseId"],"SETTLEMENT":["FinanceSettlement","settlementId"]}';
  v_kind:=p_row->>'kind';
 ELSIF p_table='FinanceBankMatchComponent' THEN
  v_map:='{"PAYMENT":["Payment","paymentId"],"REFUND":["PaymentAdjustment","paymentAdjustmentId"],"SETTLEMENT":["FinanceSettlement","settlementId"],"TRANSFER":["FinanceTransfer","transferId"],"MOVEMENT":["FinanceCashMovement","cashMovementId"]}';
  v_kind:=p_row->>'sourceType';
 ELSIF p_table='FinanceReview' THEN
  v_map:='{"PAYMENT":["Payment","sourceId"],"OPENING":["FinanceOpening","sourceId"],"SETTLEMENT":["FinanceSettlement","sourceId"],"TRANSFER":["FinanceTransfer","sourceId"],"MOVEMENT":["FinanceCashMovement","sourceId"]}';
  v_kind:=p_row->>'sourceType';
 ELSE RETURN v_parents;
 END IF;
 IF v_kind IS NULL OR NOT (v_map ? v_kind) THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Unknown economic source kind'; END IF;
 IF p_table<>'FinanceReview' THEN
  FOR v_entry IN SELECT value FROM jsonb_each(v_map) LOOP
   v_field:=v_entry->>1;
   IF p_row->>v_field IS NOT NULL THEN v_count:=v_count+1; END IF;
  END LOOP;
  IF v_count<>1 THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Exactly one economic target required'; END IF;
 END IF;
 v_entry:=v_map->v_kind;
 IF p_row->>(v_entry->>1) IS NULL THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_array(jsonb_build_array(v_entry->>0,v_entry->>1,'impact',false));
END;
$fn$;

-- 6. Impacto de una fila. SCOPE sólo resuelve identidad/tenant; IMPACT no escanea hijos.
-- Recursión acotada por topología, sin generate_series ni locks de padres financieros.
CREATE OR REPLACE FUNCTION public.top_finance_row_impact(p_table text,p_row jsonb,p_mode text,p_depth integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_cfg jsonb; v_parent_cfg jsonb; v_parent jsonb; v_part jsonb; v_item jsonb; v_child jsonb;
 v_business text:=p_row->>'businessId'; v_booking text:=p_row->>'bookingId'; v_id text:=p_row->>'id'; v_timezone text;
 v_dates jsonb:='[]'; v_ranges jsonb:='[]'; v_refs jsonb:='[]'; v_date date; v_from date; v_to date;
 v_field text; v_parent_id text; v_type text; v_parent_mode text; v_parent_booking text; v_alias text; v_context jsonb;
BEGIN
 IF p_row IS NULL OR jsonb_typeof(p_row)<>'object' OR p_depth>12 OR p_mode NOT IN ('SCOPE','IMPACT','INSERT','UPDATE','DELETE') THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 v_cfg:=public.top_finance_guard_manifest()->'tables'->p_table;
 IF v_cfg IS NULL THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 IF p_table='Business' THEN v_business:=p_row->>'id'; END IF;
 IF p_table='Booking' THEN v_booking:=p_row->>'id'; END IF;
 IF p_table='BookingResource' THEN v_id:=(p_row->>'bookingId')||':'||(p_row->>'resourceId'); END IF;
 IF p_table='PaymentApplication' THEN v_id:=(p_row->>'paymentId')||':'||(p_row->>'installmentId'); END IF;
 IF p_table='BookingTimelineEvent' AND p_row->>'type' IN ('PAYMENT_VOID_RECORDED','PAYMENT_REFUND_RECORDED','PAYMENT_RECORDED') THEN
  -- Log operativo: la fecha financiera proviene del hecho exacto, no del timestamp de log.
  v_cfg:=jsonb_set(v_cfg,'{d}','[]'::jsonb);
 END IF;
 IF v_id IS NULL OR length(btrim(v_id))=0 THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 FOR v_parent_cfg IN SELECT value FROM jsonb_array_elements(coalesce(v_cfg->'p','[]')||public.top_finance_guard_extra_parents(p_table,p_row)) LOOP
  v_field:=v_parent_cfg->>1;
  v_parent_id:=p_row#>>string_to_array(v_field,'.');
  IF v_parent_id IS NULL THEN
   IF (v_parent_cfg->>3)::boolean THEN CONTINUE; END IF;
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Required parent id missing';
  END IF;
  v_parent:=public.top_finance_guard_lookup(v_parent_cfg->>0,v_parent_id);
  v_parent_mode:=CASE WHEN p_mode<>'SCOPE' AND v_parent_cfg->>2='impact' THEN 'IMPACT' ELSE 'SCOPE' END;
  IF v_parent_cfg->>0=p_table AND p_depth>0 THEN
   -- Historia enlazada: comprueba el padre inmediato sin recorrer toda la cadena anterior.
   v_part:=jsonb_build_object('businessId',v_parent->>'businessId','bookingId',v_parent->>'bookingId','dates','[]'::jsonb,'ranges','[]'::jsonb,'refs','[]'::jsonb);
  ELSE v_part:=public.top_finance_row_impact(v_parent_cfg->>0,v_parent,v_parent_mode,p_depth+1); END IF;
  IF v_business IS NULL THEN v_business:=v_part->>'businessId';
  ELSIF v_business IS DISTINCT FROM v_part->>'businessId' THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Cross-tenant financial parent'; END IF;
  v_parent_booking:=v_part->>'bookingId';
  IF v_parent_booking IS NOT NULL THEN
   IF v_booking IS NULL THEN v_booking:=v_parent_booking;
   ELSIF v_booking<>v_parent_booking THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Financial parents reference different bookings'; END IF;
  END IF;
  IF p_row->>'accountId' IS NOT NULL AND v_parent->>'accountId' IS NOT NULL AND p_row->>'accountId'<>v_parent->>'accountId' THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Financial parents reference different accounts'; END IF;
  IF p_table='PaymentApplicationReversal' AND v_parent_cfg->>0='PaymentAdjustment' AND v_parent->>'paymentId' IS DISTINCT FROM p_row->>'paymentId' THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_table='FinanceBankMatchComponent' AND p_row->>'sourceType'='REFUND' AND v_parent_cfg->>0='PaymentAdjustment' AND v_parent->>'kind' IS DISTINCT FROM 'REFUND' THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_table='BookingTimelineEvent' AND v_parent_cfg->>0='PaymentAdjustment'
   AND (v_parent->>'kind' IS DISTINCT FROM (CASE WHEN p_row->>'type'='PAYMENT_VOID_RECORDED' THEN 'VOID' ELSE 'REFUND' END)
    OR v_parent->>'paymentId' IS DISTINCT FROM p_row->'details'->>'paymentId') THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  IF v_parent_mode='IMPACT' THEN v_dates:=v_dates||(v_part->'dates'); v_ranges:=v_ranges||(v_part->'ranges'); v_refs:=v_refs||(v_part->'refs'); END IF;
 END LOOP;
 IF v_business IS NULL OR length(btrim(v_business))=0 THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 IF p_table='PaymentApplicationReversal' AND NOT EXISTS(SELECT 1 FROM public."PaymentApplication" WHERE "paymentId"=p_row->>'paymentId' AND "installmentId"=p_row->>'installmentId') THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Original application missing'; END IF;
 IF p_mode='SCOPE' THEN RETURN jsonb_build_object('businessId',v_business,'bookingId',v_booking,'dates','[]'::jsonb,'ranges','[]'::jsonb,'refs','[]'::jsonb); END IF;
 SELECT timezone INTO v_timezone FROM public."Business" WHERE id=v_business;
 IF v_timezone IS NULL THEN RAISE EXCEPTION 'FINANCE_BUSINESS_MISSING' USING ERRCODE='23503'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_cfg->'d','[]')) LOOP
  v_field:=v_item->>0; v_type:=v_item->>1;
  IF p_row->>v_field IS NULL AND (v_item->>2)::boolean THEN CONTINUE; END IF;
  IF v_type='date' THEN v_date:=public.top_finance_guard_date(p_row->>v_field);
  ELSIF v_type='utc' THEN v_date:=public.top_finance_guard_instant_date(p_row->>v_field,v_timezone);
  ELSE RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  v_dates:=v_dates||jsonb_build_array(to_char(v_date,'YYYY-MM-DD'));
 END LOOP;
 FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_cfg->'r','[]')) LOOP
  IF p_row->>(v_item->>0) IS NULL AND p_row->>(v_item->>1) IS NULL AND v_item->>2='pair' THEN CONTINUE; END IF;
  IF v_item->>2='pair' AND (p_row->>(v_item->>0) IS NULL OR p_row->>(v_item->>1) IS NULL) THEN
   -- El MVP admite drafts con sólo una fecha. Protege esa fecha sin inventar una estancia.
   v_date:=public.top_finance_guard_date(coalesce(p_row->>(v_item->>0),p_row->>(v_item->>1)));
   v_dates:=v_dates||jsonb_build_array(to_char(v_date,'YYYY-MM-DD')); CONTINUE;
  END IF;
  IF v_item->>2='units' AND p_row->>(v_item->>1) IS NULL THEN
   v_date:=public.top_finance_guard_date(p_row->>(v_item->>0));
   v_dates:=v_dates||jsonb_build_array(to_char(v_date,'YYYY-MM-DD')); CONTINUE;
  END IF;
  v_from:=public.top_finance_guard_date(p_row->>(v_item->>0)); v_to:=NULL;
  IF p_row->>(v_item->>1) IS NOT NULL THEN v_to:=public.top_finance_guard_date(p_row->>(v_item->>1));
  ELSIF v_item->>2<>'open' THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  IF v_to IS NOT NULL AND v_from>=v_to THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  v_ranges:=v_ranges||jsonb_build_array(jsonb_build_array(to_char(v_from,'YYYY-MM-DD'),CASE WHEN v_to IS NULL THEN NULL ELSE to_char(v_to,'YYYY-MM-DD') END));
 END LOOP;
 FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_cfg->'m','[]')) LOOP
  v_field:=v_item#>>'{}';
  IF coalesce(p_row->>v_field,'')!~'^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  v_from:=public.top_finance_guard_date((p_row->>v_field)||'-01'); v_to:=(v_from+interval '1 month')::date;
  v_ranges:=v_ranges||jsonb_build_array(jsonb_build_array(to_char(v_from,'YYYY-MM-DD'),to_char(v_to,'YYYY-MM-DD')));
 END LOOP;
 IF p_table='PricingRevision' THEN
  IF p_row->>'kind' NOT IN ('SERVICE','TERMINAL_FINAL_AMOUNT') OR p_row->>'kind' IS NULL THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  FOR v_context IN SELECT p_row->'beforeContext' UNION ALL SELECT p_row->'afterContext' LOOP
   IF v_context->>'checkInDate' IS NOT NULL OR v_context->>'checkOutDate' IS NOT NULL THEN
    v_from:=public.top_finance_guard_date(v_context->>'checkInDate'); v_to:=public.top_finance_guard_date(v_context->>'checkOutDate');
    IF v_from>=v_to THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
    v_ranges:=v_ranges||jsonb_build_array(jsonb_build_array(to_char(v_from,'YYYY-MM-DD'),to_char(v_to,'YYYY-MM-DD')));
   END IF;
  END LOOP;
 END IF;
 FOR v_alias IN SELECT value#>>'{}' FROM jsonb_array_elements(v_cfg->'a') UNION SELECT upper(p_table) LOOP
  v_refs:=v_refs||jsonb_build_array(jsonb_build_object('type',v_alias,'id',v_id));
 END LOOP;
 IF p_mode IN ('UPDATE','DELETE') OR (p_mode='IMPACT' AND p_table='FinanceServiceCertificate') THEN
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(v_cfg->'c','[]')) LOOP
   IF NOT (public.top_finance_guard_manifest()->'tables' ? (v_item->>0)) THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
   FOR v_child IN EXECUTE format('SELECT to_jsonb(child) FROM public.%I child WHERE %I=$1',v_item->>0,v_item->>1) USING v_id LOOP
    v_part:=public.top_finance_row_impact(v_item->>0,v_child,'IMPACT',p_depth+1);
    IF v_part->>'businessId' IS DISTINCT FROM v_business THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
    v_dates:=v_dates||(v_part->'dates'); v_ranges:=v_ranges||(v_part->'ranges'); v_refs:=v_refs||(v_part->'refs');
   END LOOP;
  END LOOP;
 END IF;
 -- Dedupe antes de la validación estricta de changedSourceRefs (el mismo padre puede repetirse).
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'type',value->>'id'),'[]') INTO v_refs FROM (SELECT DISTINCT value FROM jsonb_array_elements(v_refs)) refs;
 RETURN jsonb_build_object('businessId',v_business,'bookingId',v_booking,'dates',v_dates,'ranges',v_ranges,'refs',v_refs);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_apply(p_impact jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_dates date[]; v_ranges daterange[];
BEGIN
 SELECT coalesce(array_agg(public.top_finance_guard_date(value#>>'{}')),'{}'::date[]) INTO v_dates FROM jsonb_array_elements(p_impact->'dates');
 SELECT coalesce(array_agg(daterange(CASE WHEN value->>0 IS NULL THEN NULL ELSE public.top_finance_guard_date(value->>0) END,
  CASE WHEN value->>1 IS NULL THEN NULL ELSE public.top_finance_guard_date(value->>1) END,'[)')),'{}'::daterange[]) INTO v_ranges FROM jsonb_array_elements(p_impact->'ranges');
 PERFORM public.top_finance_assert_impact(p_impact->>'businessId',v_dates,p_impact->'refs',v_ranges);
END;
$fn$;

-- 7. Trigger común DML. Resuelve scope, toma lock, recalcula impacto con snapshot RC fresco.
CREATE OR REPLACE FUNCTION public.top_finance_guard_row() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old jsonb; v_new jsonb; v_scope_old jsonb; v_scope_new jsonb; v_impact jsonb;
 v_business text; v_benign text[]; v_cfg jsonb; v_skip_financial boolean:=false;
BEGIN
 PERFORM public.top_finance_require_rc();
 IF TG_TABLE_SCHEMA<>'public' OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 IF TG_OP<>'INSERT' THEN v_old:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN v_new:=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND ((v_old->>'id') IS DISTINCT FROM (v_new->>'id') OR (v_old->>'businessId') IS DISTINCT FROM (v_new->>'businessId')) THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Financial identity and tenant are immutable'; END IF;
 -- Business INSERT antecede a su propia existencia; ningún hecho financiero existe todavía.
 IF TG_TABLE_NAME='Business' THEN
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (v_old->>'timezone') IS NOT DISTINCT FROM (v_new->>'timezone') AND (v_old->>'currency') IS NOT DISTINCT FROM (v_new->>'currency') THEN RETURN NEW; END IF;
  PERFORM public.top_finance_assert_impact(v_old->>'id','{}'::date[],'[]'::jsonb,ARRAY[daterange(NULL,NULL,'[)')]);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='Booking' AND v_old-'notes'=v_new-'notes' THEN v_skip_financial:=true; END IF;
 v_cfg:=public.top_finance_guard_manifest()->'tables'->TG_TABLE_NAME;
 IF TG_OP='UPDATE' AND v_cfg ? 'b' THEN
  SELECT array_agg(value#>>'{}') INTO v_benign FROM jsonb_array_elements(v_cfg->'b');
  IF v_old-v_benign=v_new-v_benign AND (v_new->>'version')::bigint=(v_old->>'version')::bigint+1 THEN v_skip_financial:=true; END IF;
 END IF;
 IF TG_TABLE_NAME='FinanceRequest' AND TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM public."FinanceCloseEvent" WHERE "requestId"=v_old->>'id') THEN
  RAISE EXCEPTION 'FINANCE_HISTORY_APPEND_ONLY' USING ERRCODE='P0001'; END IF;
 IF v_old IS NOT NULL THEN v_scope_old:=public.top_finance_row_impact(TG_TABLE_NAME,v_old,'SCOPE'); END IF;
 IF v_new IS NOT NULL THEN v_scope_new:=public.top_finance_row_impact(TG_TABLE_NAME,v_new,'SCOPE'); END IF;
 FOR v_business IN SELECT DISTINCT value FROM (VALUES(v_scope_old->>'businessId'),(v_scope_new->>'businessId')) scopes(value) WHERE value IS NOT NULL ORDER BY value LOOP
  PERFORM id FROM public."Business" WHERE id=v_business FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_BUSINESS_MISSING' USING ERRCODE='23503'; END IF;
 END LOOP;
 IF v_skip_financial THEN
  -- El CAS no toca fuentes económicas, pero participa del lock y falla ante cierre corrupto.
  PERFORM public.top_finance_assert_impact(v_scope_new->>'businessId','{}'::date[],'[]'::jsonb,'{}'::daterange[]);
  RETURN NEW;
 END IF;
 IF v_old IS NOT NULL THEN
  v_impact:=public.top_finance_row_impact(TG_TABLE_NAME,v_old,'DELETE');
  IF v_impact->>'businessId' IS DISTINCT FROM v_scope_old->>'businessId' THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM public.top_finance_guard_apply(v_impact);
 END IF;
 IF v_new IS NOT NULL THEN
  v_impact:=public.top_finance_row_impact(TG_TABLE_NAME,v_new,CASE WHEN TG_OP='INSERT' THEN 'INSERT' ELSE 'UPDATE' END);
  IF v_impact->>'businessId' IS DISTINCT FROM v_scope_new->>'businessId' THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM public.top_finance_guard_apply(v_impact);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$fn$;

-- 8. Control de cierre: validación inmediata de topology y diferida del protocolo completo.
CREATE OR REPLACE FUNCTION public.top_finance_close_owner(p_business text,p_actor text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN
 -- No toma locks de User/Membership después de Business. La ruta app ya autoriza/bloquea antes.
 -- Valida el actor registrado, no autentica la sesión SQL privilegiada.
 IF NOT EXISTS(SELECT 1 FROM public."User" actor JOIN public."UserBusinessMembership" membership ON membership."userId"=actor.id
  WHERE actor.id=p_actor AND actor.status='ACTIVE' AND membership."businessId"=p_business AND membership.role='OWNER') THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Close history requires an active registered OWNER'; END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_period() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_timezone text; v_snapshot jsonb;
BEGIN
 PERFORM public.top_finance_require_rc();
 IF TG_OP='DELETE' THEN
  SELECT timezone INTO v_timezone FROM public."Business" WHERE id=OLD."businessId" FOR UPDATE;
  IF OLD.status='CLOSED' THEN RAISE EXCEPTION 'FINANCE_PERIOD_CLOSED' USING ERRCODE='P0001'; END IF;
  IF OLD."latestSnapshotId" IS NOT NULL THEN RAISE EXCEPTION 'FINANCE_HISTORY_APPEND_ONLY' USING ERRCODE='P0001'; END IF;
  RETURN OLD;
 END IF;
 SELECT timezone INTO v_timezone FROM public."Business" WHERE id=NEW."businessId" FOR UPDATE;
 IF v_timezone IS NULL OR NEW."timeZone"<>v_timezone OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_timezone)
  OR NEW."from" IS NULL OR NEW."to" IS NULL OR extract(day FROM NEW."from")<>1 OR NEW."to"<>(NEW."from"+interval '1 month')::date THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'OPEN' OR NEW.version<>1 OR NEW."latestSnapshotId" IS NOT NULL OR EXISTS(SELECT 1 FROM public."FinancePeriod" WHERE "businessId"=NEW."businessId" AND daterange("from","to",'[)')&&daterange(NEW."from",NEW."to",'[)')) THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(OLD)-ARRAY['status','version','latestSnapshotId']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','version','latestSnapshotId'])
  OR NEW.version<>OLD.version+1 OR OLD.status NOT IN ('OPEN','CLOSED')
  OR NEW.status IS DISTINCT FROM (CASE WHEN OLD.status='OPEN' THEN 'CLOSED' ELSE 'OPEN' END) THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Only CLOSE/REOPEN CAS transitions are allowed'; END IF;
 IF NEW.status='CLOSED' THEN
  IF NEW."to">(clock_timestamp() AT TIME ZONE v_timezone)::date THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(snapshot) INTO v_snapshot FROM public."FinanceCloseSnapshot" snapshot WHERE id=NEW."latestSnapshotId";
  IF NOT public.top_finance_close_snapshot_valid(v_snapshot) OR v_snapshot->>'businessId' IS DISTINCT FROM NEW."businessId"
   OR v_snapshot->>'periodId' IS DISTINCT FROM NEW.id OR (v_snapshot->>'closeVersion')::integer<>NEW.version
   OR v_snapshot->>'previousSnapshotId' IS DISTINCT FROM OLD."latestSnapshotId" THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM public."FinanceCloseGuardEvidence")<>40 OR EXISTS(SELECT 1 FROM public."FinanceCloseGuardEvidence" WHERE installed IS NOT TRUE) THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='All 40 writers must be guarded'; END IF;
 ELSE
  IF NEW."latestSnapshotId" IS DISTINCT FROM OLD."latestSnapshotId" OR OLD."latestSnapshotId" IS NULL THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_close_history() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_period public."FinancePeriod"%ROWTYPE; v_row jsonb:=to_jsonb(NEW); v_snapshot jsonb;
BEGIN
 PERFORM public.top_finance_require_rc();
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'FINANCE_HISTORY_APPEND_ONLY' USING ERRCODE='P0001'; END IF;
 PERFORM id FROM public."Business" WHERE id=NEW."businessId" FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_BUSINESS_MISSING' USING ERRCODE='23503'; END IF;
 SELECT * INTO v_period FROM public."FinancePeriod" WHERE id=NEW."periodId" AND "businessId"=NEW."businessId";
 IF NOT FOUND THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 IF TG_TABLE_NAME='FinanceCloseSnapshot' THEN
  PERFORM public.top_finance_close_owner(NEW."businessId",NEW."recordedByUserId");
  IF v_period.status<>'OPEN' OR NEW."closeVersion"<>v_period.version+1
   OR NEW."previousSnapshotId" IS DISTINCT FROM v_period."latestSnapshotId" OR NOT public.top_finance_close_snapshot_valid(v_row)
   OR v_row->'payload'->'registeredOperations'->>'businessId' IS DISTINCT FROM NEW."businessId"
   OR v_row->'payload'->'registeredOperations'->>'from' IS DISTINCT FROM to_char(v_period."from",'YYYY-MM-DD')
   OR v_row->'payload'->'registeredOperations'->>'to' IS DISTINCT FROM to_char(v_period."to",'YYYY-MM-DD')
   OR v_row->'payload'->'registeredOperations'->>'timeZone' IS DISTINCT FROM v_period."timeZone"
   OR v_row->'payload'->'profitability'->>'businessId' IS DISTINCT FROM NEW."businessId"
   OR v_row->'payload'->'profitability'->>'from' IS DISTINCT FROM to_char(v_period."from",'YYYY-MM-DD')
   OR v_row->'payload'->'profitability'->>'to' IS DISTINCT FROM to_char(v_period."to",'YYYY-MM-DD')
   OR v_row->'payload'->'profitability'->>'timeZone' IS DISTINCT FROM v_period."timeZone" THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 ELSE
  PERFORM public.top_finance_close_owner(NEW."businessId",NEW."actorUserId");
  SELECT to_jsonb(snapshot) INTO v_snapshot FROM public."FinanceCloseSnapshot" snapshot WHERE id=NEW."snapshotId";
  IF NEW.type NOT IN ('CLOSE','REOPEN') OR NEW."afterVersion"<>NEW."beforeVersion"+1 OR NEW."afterVersion"<>v_period.version
   OR NEW."snapshotId" IS DISTINCT FROM v_period."latestSnapshotId" OR length(btrim(NEW.reason))=0
   OR (NEW.type='CLOSE' AND v_period.status<>'CLOSED') OR (NEW.type='REOPEN' AND v_period.status<>'OPEN')
   OR NOT public.top_finance_close_snapshot_valid(v_snapshot) OR v_snapshot->>'businessId' IS DISTINCT FROM NEW."businessId"
   OR v_snapshot->>'periodId' IS DISTINCT FROM NEW."periodId" THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_period_commit() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_event jsonb; v_request jsonb; v_snapshot jsonb; v_count integer; v_expected text; v_required jsonb;
 v_period public."FinancePeriod"%ROWTYPE; v_audit_actor text;
BEGIN
 -- Snapshot/Event son también constraint sources: impide INSERT aislado sin transición.
 IF TG_TABLE_NAME='FinanceCloseSnapshot' THEN
  IF NOT EXISTS(SELECT 1 FROM public."FinanceCloseEvent" WHERE "businessId"=NEW."businessId" AND "periodId"=NEW."periodId" AND "snapshotId"=NEW.id AND type='CLOSE' AND "afterVersion"=NEW."closeVersion") THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Orphan close snapshot'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='FinanceCloseEvent' THEN
  SELECT to_jsonb(request) INTO v_request FROM public."FinanceRequest" request WHERE id=NEW."requestId" AND "businessId"=NEW."businessId";
  v_expected:=CASE WHEN NEW.type='CLOSE' THEN 'CLOSE_FINANCE_PERIOD' ELSE 'REOPEN_FINANCE_PERIOD' END;
  v_required:=to_jsonb(NEW)-ARRAY['occurredAt','requestId'];
  SELECT * INTO v_period FROM public."FinancePeriod" WHERE id=NEW."periodId" AND "businessId"=NEW."businessId";
  IF v_request IS NULL OR v_request->>'operation' IS DISTINCT FROM v_expected
   OR v_request->'result'->'event'->>'id' IS DISTINCT FROM NEW.id
   OR v_request->'result'->'event'->>'type' IS DISTINCT FROM NEW.type
   OR v_request->'result'->'period'->>'id' IS DISTINCT FROM NEW."periodId"
   OR (v_request->'result'->'period'->>'version') IS DISTINCT FROM NEW."afterVersion"::text
   OR NOT coalesce((v_request->'result'->'event')@>v_required,false)
   OR v_request->'result'->'period'->>'businessId' IS DISTINCT FROM NEW."businessId"
   OR v_request->'result'->'period'->>'from' IS DISTINCT FROM to_char(v_period."from",'YYYY-MM-DD')
   OR v_request->'result'->'period'->>'to' IS DISTINCT FROM to_char(v_period."to",'YYYY-MM-DD')
   OR v_request->'result'->'period'->>'timeZone' IS DISTINCT FROM v_period."timeZone"
   OR v_request->'result'->'period'->>'status' IS DISTINCT FROM (CASE WHEN NEW.type='CLOSE' THEN 'CLOSED' ELSE 'OPEN' END)
   OR v_request->'result'->'period'->>'latestSnapshotId' IS DISTINCT FROM NEW."snapshotId"
   OR (v_request->'result'->'event'->>'occurredAt')::timestamptz IS DISTINCT FROM NEW."occurredAt" AT TIME ZONE 'UTC'
   OR coalesce(v_request->>'fingerprint','')!~'^[a-f0-9]{64}$' OR length(btrim(coalesce(v_request->>'idempotencyKey','')))=0 THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Close event requires matching request result'; END IF;
  IF NEW.type='CLOSE' THEN
   SELECT to_jsonb(snapshot) INTO v_snapshot FROM public."FinanceCloseSnapshot" snapshot WHERE id=NEW."snapshotId";
   IF NOT coalesce((v_request->'result'->'snapshot')@>(v_snapshot-ARRAY['asOf','recordedAt']),false)
    OR v_snapshot->>'recordedByUserId' IS DISTINCT FROM NEW."actorUserId"
    OR (v_request->'result'->'snapshot'->>'asOf')::timestamptz IS DISTINCT FROM (v_snapshot->>'asOf')::timestamp AT TIME ZONE 'UTC'
    OR (v_request->'result'->'snapshot'->>'recordedAt')::timestamptz IS DISTINCT FROM NEW."occurredAt" AT TIME ZONE 'UTC'
    OR (v_snapshot->>'recordedAt')::timestamp IS DISTINCT FROM NEW."occurredAt" THEN
    RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Close request must bind exact snapshot and actor'; END IF;
  ELSIF v_request->'result'->'snapshot' IS DISTINCT FROM 'null'::jsonb THEN
   RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
  SELECT count(*) INTO v_count FROM public."FinanceRequest" WHERE "businessId"=NEW."businessId" AND operation='CREATE_FINANCE_PERIOD'
   AND result@>(to_jsonb(NEW)-'createdAt') AND fingerprint~'^[a-f0-9]{64}$' AND length(btrim("idempotencyKey"))>0;
  IF v_count<>1 THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Period creation requires request'; END IF;
  SELECT "actorUserId" INTO v_audit_actor FROM public."FinanceAudit" WHERE "businessId"=NEW."businessId" AND "sourceId"=NEW.id
   AND action='CREATE_FINANCE_PERIOD' AND details->'result'@>(to_jsonb(NEW)-'createdAt') LIMIT 1;
  PERFORM public.top_finance_close_owner(NEW."businessId",v_audit_actor);
  RETURN NEW;
 END IF;
 SELECT count(*),jsonb_agg(to_jsonb(event))->0 INTO v_count,v_event FROM public."FinanceCloseEvent" event
  WHERE "businessId"=NEW."businessId" AND "periodId"=NEW.id AND "beforeVersion"=OLD.version AND "afterVersion"=NEW.version;
 IF v_count<>1 OR v_event->>'type' IS DISTINCT FROM (CASE WHEN NEW.status='CLOSED' THEN 'CLOSE' ELSE 'REOPEN' END)
  OR v_event->>'snapshotId' IS DISTINCT FROM NEW."latestSnapshotId" THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Period transition requires exactly one matching event'; END IF;
 -- Lee sólo historia/plain rows; no toma locks Booking/Payment/Expense durante CLOSE.
 SELECT to_jsonb(snapshot) INTO v_snapshot FROM public."FinanceCloseSnapshot" snapshot WHERE id=NEW."latestSnapshotId";
 IF NOT public.top_finance_close_snapshot_valid(v_snapshot) THEN RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023'; END IF;
 RETURN NEW;
 EXCEPTION WHEN data_exception THEN
  RAISE EXCEPTION 'FINANCE_WRITE_IMPACT_INVALID' USING ERRCODE='22023',DETAIL='Malformed close protocol metadata';
END;
$fn$;

-- 9. Registro de DDL confiable. Se captura DESPUÉS de CREATE, una vez en esta migration.
-- No se deriva el hash esperado del estado actual durante una consulta de evidencia.
CREATE TABLE public."FinanceGuardFunctionBaseline" (
 signature text PRIMARY KEY,
 "definitionSha256" text NOT NULL CHECK("definitionSha256" ~ '^[a-f0-9]{64}$')
);
REVOKE ALL ON public."FinanceGuardFunctionBaseline" FROM PUBLIC;
-- Metadata global de integridad, sin datos de tenants. Sólo lectura para usuarios DB.
GRANT SELECT ON public."FinanceGuardFunctionBaseline" TO PUBLIC;

CREATE OR REPLACE FUNCTION public.top_finance_guard_registry_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
BEGIN RAISE EXCEPTION 'FINANCE_GUARD_REGISTRY_IMMUTABLE' USING ERRCODE='P0001'; END;
$fn$;

CREATE OR REPLACE FUNCTION public.top_finance_guard_functions_valid() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $fn$
DECLARE v_signature text; v_expected text; v_oid oid; v_required text[]:=ARRAY[
 'public.top_finance_guard_manifest()', 'public.top_finance_require_rc()', 'public.top_finance_guard_date(text)',
 'public.top_finance_guard_instant_date(text,text)', 'public.top_finance_guard_refs_valid(jsonb,boolean)',
 'public.top_finance_guard_lookup(text,text)',
 'public.top_finance_close_snapshot_valid(jsonb)', 'public.top_finance_assert_impact(text,date[],jsonb,daterange[])',
 'public.top_finance_assert_open(text,date[],jsonb)', 'public.top_finance_guard_extra_parents(text,jsonb)',
 'public.top_finance_row_impact(text,jsonb,text,integer)', 'public.top_finance_guard_apply(jsonb)', 'public.top_finance_guard_row()',
 'public.top_finance_close_owner(text,text)', 'public.top_finance_guard_period()', 'public.top_finance_guard_close_history()',
 'public.top_finance_guard_period_commit()', 'public.top_finance_guard_registry_immutable()', 'public.top_finance_guard_functions_valid()'];
BEGIN
 IF (SELECT count(*) FROM public."FinanceGuardFunctionBaseline")<>cardinality(v_required) THEN RETURN false; END IF;
 FOREACH v_signature IN ARRAY v_required LOOP
  v_oid:=to_regprocedure(v_signature); IF v_oid IS NULL THEN RETURN false; END IF;
  SELECT "definitionSha256" INTO v_expected FROM public."FinanceGuardFunctionBaseline" WHERE signature=v_signature;
  IF v_expected IS NULL OR v_expected<>encode(sha256(convert_to(pg_get_functiondef(v_oid),'UTF8')),'hex') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$fn$;

-- 10. Instala TODAS las tablas requeridas; una tabla ausente aborta la migration.
DO $install$
DECLARE v_table text;
BEGIN
 FOR v_table IN SELECT jsonb_object_keys(public.top_finance_guard_manifest()->'tables') LOOP
  EXECUTE format('CREATE TRIGGER top_finance_dml_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_row()',v_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER top_finance_dml_guard',v_table);
 END LOOP;
END;
$install$;

CREATE TRIGGER top_finance_dml_guard BEFORE INSERT OR UPDATE OR DELETE ON public."FinancePeriod" FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_period();
ALTER TABLE public."FinancePeriod" ENABLE ALWAYS TRIGGER top_finance_dml_guard;
CREATE TRIGGER top_finance_dml_guard BEFORE INSERT OR UPDATE OR DELETE ON public."FinanceCloseSnapshot" FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_close_history();
ALTER TABLE public."FinanceCloseSnapshot" ENABLE ALWAYS TRIGGER top_finance_dml_guard;
CREATE TRIGGER top_finance_dml_guard BEFORE INSERT OR UPDATE OR DELETE ON public."FinanceCloseEvent" FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_close_history();
ALTER TABLE public."FinanceCloseEvent" ENABLE ALWAYS TRIGGER top_finance_dml_guard;

CREATE CONSTRAINT TRIGGER top_finance_protocol_commit AFTER INSERT OR UPDATE ON public."FinancePeriod"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_period_commit();
ALTER TABLE public."FinancePeriod" ENABLE ALWAYS TRIGGER top_finance_protocol_commit;
CREATE CONSTRAINT TRIGGER top_finance_protocol_commit AFTER INSERT ON public."FinanceCloseSnapshot"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_period_commit();
ALTER TABLE public."FinanceCloseSnapshot" ENABLE ALWAYS TRIGGER top_finance_protocol_commit;
CREATE CONSTRAINT TRIGGER top_finance_protocol_commit AFTER INSERT ON public."FinanceCloseEvent"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_period_commit();
ALTER TABLE public."FinanceCloseEvent" ENABLE ALWAYS TRIGGER top_finance_protocol_commit;

-- El view se construye con targets constantes del manifest confiable.
-- bitmask BEFORE ROW INSERT/DELETE/UPDATE = 31; AFTER ROW INSERT/UPDATE = 21;
-- AFTER ROW INSERT = 5. No WHEN, columnas parciales, argumentos, clones ni tgenabled='O'.
CREATE VIEW public."FinanceCloseGuardEvidence" AS
WITH manifest AS (SELECT public.top_finance_guard_manifest() AS body),
targets AS (
 SELECT key AS table_name,'public.top_finance_guard_row()'::text AS signature FROM manifest,jsonb_each(body->'tables')
 UNION ALL SELECT 'FinancePeriod','public.top_finance_guard_period()'
 UNION ALL SELECT 'FinanceCloseSnapshot','public.top_finance_guard_close_history()'
 UNION ALL SELECT 'FinanceCloseEvent','public.top_finance_guard_close_history()'
), dml AS (
 SELECT target.table_name,EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger
  JOIN pg_catalog.pg_class relation ON relation.oid=trigger.tgrelid JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='public' AND relation.relname=target.table_name AND trigger.tgname='top_finance_dml_guard'
   AND trigger.tgfoid=to_regprocedure(target.signature) AND NOT trigger.tgisinternal AND trigger.tgenabled='A'
   AND trigger.tgtype=31 AND trigger.tgnargs=0 AND trigger.tgqual IS NULL AND trigger.tgparentid=0
   AND cardinality(trigger.tgattr::smallint[])=0 AND NOT trigger.tgdeferrable AND NOT trigger.tginitdeferred) AS installed
 FROM targets target
), protocol AS (
 SELECT bool_and(EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger JOIN pg_catalog.pg_class relation ON relation.oid=trigger.tgrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
  WHERE namespace.nspname='public' AND relation.relname=target.table_name AND trigger.tgname='top_finance_protocol_commit'
   AND trigger.tgfoid=to_regprocedure('public.top_finance_guard_period_commit()') AND NOT trigger.tgisinternal AND trigger.tgenabled='A'
   AND trigger.tgtype=target.type AND trigger.tgnargs=0 AND trigger.tgqual IS NULL AND trigger.tgparentid=0
   AND cardinality(trigger.tgattr::smallint[])=0 AND trigger.tgdeferrable AND trigger.tginitdeferred AND trigger.tgconstraint<>0)) AS installed
 FROM (VALUES('FinancePeriod',21),('FinanceCloseSnapshot',5),('FinanceCloseEvent',5)) target(table_name,type)
), registry AS (
 SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger trigger WHERE trigger.tgrelid='public."FinanceGuardFunctionBaseline"'::regclass
  AND trigger.tgname='top_finance_registry_immutable' AND trigger.tgfoid=to_regprocedure('public.top_finance_guard_registry_immutable()')
  AND NOT trigger.tgisinternal AND trigger.tgenabled='A' AND trigger.tgtype=31 AND trigger.tgnargs=0
  AND trigger.tgqual IS NULL AND trigger.tgparentid=0 AND cardinality(trigger.tgattr::smallint[])=0) AS installed
), writer_targets AS (
 SELECT writer.key AS writer,target.value#>>'{}' AS table_name FROM manifest,jsonb_each(body->'writers') writer,
  LATERAL jsonb_array_elements(writer.value) target WHERE writer.key<>'DIRECT_SQL_IMPORT'
 UNION ALL SELECT 'DIRECT_SQL_IMPORT',table_name FROM targets
)
SELECT writer_targets.writer,
 bool_and(coalesce(dml.installed,false)) AND public.top_finance_guard_functions_valid()
  AND (SELECT installed FROM protocol) AND (SELECT installed FROM registry) AS installed
FROM writer_targets LEFT JOIN dml USING(table_name) GROUP BY writer_targets.writer;
GRANT SELECT ON public."FinanceCloseGuardEvidence" TO PUBLIC;

-- Captura de firmas confiables, sin sobrescribir valores en un rerun silencioso.
INSERT INTO public."FinanceGuardFunctionBaseline"(signature,"definitionSha256")
SELECT signature,encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')
FROM unnest(ARRAY[
 'public.top_finance_guard_manifest()', 'public.top_finance_require_rc()', 'public.top_finance_guard_date(text)',
 'public.top_finance_guard_instant_date(text,text)', 'public.top_finance_guard_refs_valid(jsonb,boolean)',
 'public.top_finance_guard_lookup(text,text)',
 'public.top_finance_close_snapshot_valid(jsonb)', 'public.top_finance_assert_impact(text,date[],jsonb,daterange[])',
 'public.top_finance_assert_open(text,date[],jsonb)', 'public.top_finance_guard_extra_parents(text,jsonb)',
 'public.top_finance_row_impact(text,jsonb,text,integer)', 'public.top_finance_guard_apply(jsonb)', 'public.top_finance_guard_row()',
 'public.top_finance_close_owner(text,text)', 'public.top_finance_guard_period()', 'public.top_finance_guard_close_history()',
 'public.top_finance_guard_period_commit()', 'public.top_finance_guard_registry_immutable()', 'public.top_finance_guard_functions_valid()'
]) signatures(signature);
CREATE TRIGGER top_finance_registry_immutable BEFORE INSERT OR UPDATE OR DELETE ON public."FinanceGuardFunctionBaseline"
FOR EACH ROW EXECUTE FUNCTION public.top_finance_guard_registry_immutable();
ALTER TABLE public."FinanceGuardFunctionBaseline" ENABLE ALWAYS TRIGGER top_finance_registry_immutable;

-- Sólo evidencia de instalación, no sustituye GWT DML/races/hash en servidor.
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public."FinanceCloseGuardEvidence")<>40 OR EXISTS(SELECT 1 FROM public."FinanceCloseGuardEvidence" WHERE installed IS NOT TRUE) THEN
  RAISE EXCEPTION 'FINANCE_GUARDS_NOT_INSTALLED' USING ERRCODE='P0001'; END IF;
END;
$verify$;


-- Archivos privados: append-only, sin purga ni edición económica de un cierre.
CREATE FUNCTION public.top_finance_evidence_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $file$
BEGIN RAISE EXCEPTION 'FINANCE_EVIDENCE_IMMUTABLE' USING ERRCODE='P0001'; END;
$file$;
CREATE TRIGGER top_finance_evidence_immutable BEFORE UPDATE OR DELETE ON public."FinanceEvidenceFile"
FOR EACH ROW EXECUTE FUNCTION public.top_finance_evidence_immutable();
ALTER TABLE public."FinanceEvidenceFile" ENABLE ALWAYS TRIGGER top_finance_evidence_immutable;

COMMIT;
