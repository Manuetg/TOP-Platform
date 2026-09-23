CREATE TABLE "SubscriptionPlan" (
  "code" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "maxResources" INTEGER NOT NULL CHECK ("maxResources" > 0)
);
INSERT INTO "SubscriptionPlan" ("code", "name", "maxResources") VALUES ('TOP_INITIAL', 'TOP Inicial', 10);
CREATE TABLE "BusinessSubscription" (
  "businessId" TEXT PRIMARY KEY REFERENCES "Business"("id") ON DELETE CASCADE,
  "planCode" TEXT NOT NULL DEFAULT 'TOP_INITIAL' REFERENCES "SubscriptionPlan"("code") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "upgradeRequestedAt" TIMESTAMP(3),
  "upgradeRequestedBy" TEXT,
  CONSTRAINT "upgrade_request_complete" CHECK (("upgradeRequestedAt" IS NULL) = ("upgradeRequestedBy" IS NULL))
);
INSERT INTO "BusinessSubscription" ("businessId") SELECT "id" FROM "Business";
