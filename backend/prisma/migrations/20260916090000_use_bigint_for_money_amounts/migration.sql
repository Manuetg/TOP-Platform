ALTER TABLE "RatePlan"
  ALTER COLUMN "baseNightlyAmountMinor" TYPE BIGINT USING "baseNightlyAmountMinor"::BIGINT;

ALTER TABLE "SeasonalRate"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::BIGINT;

ALTER TABLE "Payment"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::BIGINT;

ALTER TABLE "PaymentPlan"
  ALTER COLUMN "totalAmountMinor" TYPE BIGINT USING "totalAmountMinor"::BIGINT;

ALTER TABLE "PaymentPlanInstallment"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::BIGINT;

ALTER TABLE "PaymentApplication"
  ALTER COLUMN "amountMinor" TYPE BIGINT USING "amountMinor"::BIGINT;

ALTER TABLE "PricingSnapshot"
  ALTER COLUMN "totalAmountMinor" TYPE BIGINT USING "totalAmountMinor"::BIGINT;
