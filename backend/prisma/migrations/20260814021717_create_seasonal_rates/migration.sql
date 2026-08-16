-- CreateTable
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "SeasonalRate" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonalRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeasonalRate_ratePlanId_idx" ON "SeasonalRate"("ratePlanId");

-- CreateIndex
CREATE INDEX "SeasonalRate_ratePlanId_startDate_endDate_idx" ON "SeasonalRate"("ratePlanId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "SeasonalRate" ADD CONSTRAINT "SeasonalRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeasonalRate" ADD CONSTRAINT "SeasonalRate_rate_plan_date_range_excl"
  EXCLUDE USING gist (
    "ratePlanId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  );
