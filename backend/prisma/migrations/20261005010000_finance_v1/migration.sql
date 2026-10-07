-- CreateTable
CREATE TABLE "FinanceCatalog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOpening" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "consumedOn" DATE NOT NULL,
    "dueOn" DATE,
    "counterpartyId" TEXT,
    "reference" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceExpenseLine" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "resourceId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "operational" BOOLEAN NOT NULL,

    CONSTRAINT "FinanceExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSettlement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePaymentLink" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransfer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCashMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "openingId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReview" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "reviewed" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCashCount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expectedAmountMinor" BIGINT NOT NULL,
    "countedAmountMinor" BIGINT NOT NULL,
    "differenceMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "adjustmentId" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAudit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL,

    CONSTRAINT "FinanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceCatalog_businessId_kind_archived_name_id_idx" ON "FinanceCatalog"("businessId", "kind", "archived", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCatalog_id_businessId_key" ON "FinanceCatalog"("id", "businessId");

-- CreateIndex
CREATE INDEX "FinanceAccount_businessId_archived_name_id_idx" ON "FinanceAccount"("businessId", "archived", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_id_businessId_key" ON "FinanceAccount"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpening_accountId_key" ON "FinanceOpening"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpening_accountId_businessId_key" ON "FinanceOpening"("accountId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpening_id_businessId_key" ON "FinanceOpening"("id", "businessId");

-- CreateIndex
CREATE INDEX "FinanceExpense_businessId_consumedOn_id_idx" ON "FinanceExpense"("businessId", "consumedOn", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpense_id_businessId_key" ON "FinanceExpense"("id", "businessId");

-- CreateIndex
CREATE INDEX "FinanceExpenseLine_expenseId_businessId_idx" ON "FinanceExpenseLine"("expenseId", "businessId");

-- CreateIndex
CREATE INDEX "FinanceSettlement_businessId_occurredAt_id_idx" ON "FinanceSettlement"("businessId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "FinanceSettlement_expenseId_businessId_idx" ON "FinanceSettlement"("expenseId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSettlement_id_businessId_key" ON "FinanceSettlement"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePaymentLink_paymentId_key" ON "FinancePaymentLink"("paymentId");

-- CreateIndex
CREATE INDEX "FinancePaymentLink_businessId_accountId_idx" ON "FinancePaymentLink"("businessId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePaymentLink_paymentId_businessId_key" ON "FinancePaymentLink"("paymentId", "businessId");

-- CreateIndex
CREATE INDEX "FinanceTransfer_businessId_occurredAt_id_idx" ON "FinanceTransfer"("businessId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransfer_id_businessId_key" ON "FinanceTransfer"("id", "businessId");

-- CreateIndex
CREATE INDEX "FinanceCashMovement_businessId_occurredAt_id_idx" ON "FinanceCashMovement"("businessId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashMovement_id_businessId_key" ON "FinanceCashMovement"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceReview_businessId_sourceType_sourceId_key" ON "FinanceReview"("businessId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashCount_adjustmentId_key" ON "FinanceCashCount"("adjustmentId");

-- CreateIndex
CREATE INDEX "FinanceCashCount_businessId_occurredAt_id_idx" ON "FinanceCashCount"("businessId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashCount_adjustmentId_businessId_key" ON "FinanceCashCount"("adjustmentId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashCount_id_businessId_key" ON "FinanceCashCount"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRequest_businessId_operation_idempotencyKey_key" ON "FinanceRequest"("businessId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "FinanceAudit_businessId_sourceId_occurredAt_id_idx" ON "FinanceAudit"("businessId", "sourceId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_id_businessId_key" ON "Resource"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_businessId_key" ON "Payment"("id", "businessId");

-- AddForeignKey
ALTER TABLE "FinanceCatalog" ADD CONSTRAINT "FinanceCatalog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpening" ADD CONSTRAINT "FinanceOpening_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpening" ADD CONSTRAINT "FinanceOpening_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_counterpartyId_businessId_fkey" FOREIGN KEY ("counterpartyId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_categoryId_businessId_fkey" FOREIGN KEY ("categoryId", "businessId") REFERENCES "FinanceCatalog"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_resourceId_businessId_fkey" FOREIGN KEY ("resourceId", "businessId") REFERENCES "Resource"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSettlement" ADD CONSTRAINT "FinanceSettlement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSettlement" ADD CONSTRAINT "FinanceSettlement_expenseId_businessId_fkey" FOREIGN KEY ("expenseId", "businessId") REFERENCES "FinanceExpense"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSettlement" ADD CONSTRAINT "FinanceSettlement_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePaymentLink" ADD CONSTRAINT "FinancePaymentLink_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePaymentLink" ADD CONSTRAINT "FinancePaymentLink_paymentId_businessId_fkey" FOREIGN KEY ("paymentId", "businessId") REFERENCES "Payment"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePaymentLink" ADD CONSTRAINT "FinancePaymentLink_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_fromAccountId_businessId_fkey" FOREIGN KEY ("fromAccountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_toAccountId_businessId_fkey" FOREIGN KEY ("toAccountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashMovement" ADD CONSTRAINT "FinanceCashMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashMovement" ADD CONSTRAINT "FinanceCashMovement_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashMovement" ADD CONSTRAINT "FinanceCashMovement_openingId_businessId_fkey" FOREIGN KEY ("openingId", "businessId") REFERENCES "FinanceOpening"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceReview" ADD CONSTRAINT "FinanceReview_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashCount" ADD CONSTRAINT "FinanceCashCount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashCount" ADD CONSTRAINT "FinanceCashCount_accountId_businessId_fkey" FOREIGN KEY ("accountId", "businessId") REFERENCES "FinanceAccount"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashCount" ADD CONSTRAINT "FinanceCashCount_adjustmentId_businessId_fkey" FOREIGN KEY ("adjustmentId", "businessId") REFERENCES "FinanceCashMovement"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRequest" ADD CONSTRAINT "FinanceRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAudit" ADD CONSTRAINT "FinanceAudit_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PYG escala 1:1 y catálogo cerrado. No introduce saldos persistidos ni cambia Payment.
ALTER TABLE "FinanceCatalog" ADD CONSTRAINT "FinanceCatalog_kind_check" CHECK ("kind" IN ('CATEGORY', 'COUNTERPARTY'));
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_kind_check" CHECK ("kind" IN ('CASH', 'BANK'));
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_money_check" CHECK ("amountMinor" BETWEEN 1 AND 9007199254740991);
ALTER TABLE "FinanceExpenseLine" ADD CONSTRAINT "FinanceExpenseLine_money_check" CHECK ("amountMinor" BETWEEN 1 AND 9007199254740991);
ALTER TABLE "FinanceSettlement" ADD CONSTRAINT "FinanceSettlement_money_check" CHECK ("amountMinor" BETWEEN 1 AND 9007199254740991);
ALTER TABLE "FinanceOpening" ADD CONSTRAINT "FinanceOpening_money_check" CHECK ("amountMinor" BETWEEN -9007199254740991 AND 9007199254740991);
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_money_check" CHECK ("amountMinor" BETWEEN 1 AND 9007199254740991 AND "fromAccountId" <> "toAccountId");
ALTER TABLE "FinanceCashMovement" ADD CONSTRAINT "FinanceCashMovement_money_check" CHECK (
  "amountMinor" BETWEEN -9007199254740991 AND 9007199254740991 AND
  (("kind" IN ('CONTRIBUTION', 'FINANCING') AND "amountMinor" > 0) OR
   ("kind" = 'WITHDRAWAL' AND "amountMinor" < 0) OR
   ("kind" = 'ADJUSTMENT' AND "amountMinor" <> 0)) AND
  ("openingId" IS NULL OR "kind" = 'ADJUSTMENT')
);
ALTER TABLE "FinanceCashCount" ADD CONSTRAINT "FinanceCashCount_money_check" CHECK (
  "countedAmountMinor" BETWEEN 0 AND 9007199254740991 AND
  "expectedAmountMinor" BETWEEN -9007199254740991 AND 9007199254740991 AND
  "differenceMinor" BETWEEN -9007199254740991 AND 9007199254740991 AND
  "differenceMinor" = "countedAmountMinor" - "expectedAmountMinor"
);

-- Los documentos originales y la auditoría conservan su historia incluso ante escrituras SQL.
CREATE FUNCTION finance_preserve_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'FINANCE_HISTORY_IMMUTABLE'; END IF;
  IF TG_TABLE_NAME IN ('FinanceOpening', 'FinanceExpenseLine', 'FinanceSettlement', 'FinanceTransfer', 'FinanceCashMovement', 'FinanceRequest', 'FinanceAudit') THEN
    RAISE EXCEPTION 'FINANCE_HISTORY_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'FinanceExpense' AND
     (to_jsonb(NEW) - 'reference' - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'reference' - 'version') THEN
    RAISE EXCEPTION 'FINANCE_EXPENSE_IMMUTABLE';
  END IF;
  IF TG_TABLE_NAME = 'FinanceCashCount' AND
     (to_jsonb(NEW) - 'adjustmentId' - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'adjustmentId' - 'version') THEN
    RAISE EXCEPTION 'FINANCE_COUNT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['FinanceCatalog','FinanceAccount','FinanceOpening','FinanceExpense','FinanceExpenseLine','FinanceSettlement','FinancePaymentLink','FinanceTransfer','FinanceCashMovement','FinanceReview','FinanceCashCount','FinanceRequest','FinanceAudit'] LOOP
    EXECUTE format('CREATE TRIGGER finance_history_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_preserve_history()', table_name);
  END LOOP;
END;
$$;
